/* The build test inserts the actual patched upstream function at the marker. */
#define _GNU_SOURCE
#include <assert.h>
#include <errno.h>
#include <fcntl.h>
#include <linux/magic.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <sys/vfs.h>
#include <sys/wait.h>
#include <unistd.h>

#define __init
#define UM_KERN_PAGE_SIZE 4096
#define os_info printf

static int fault;

static int checked_memfd(const char *name, unsigned flags)
{
    if (fault == 1) {
        errno = ENOSYS;
        return -1;
    }
    return memfd_create(name, flags);
}

static int checked_truncate(int fd, off64_t len)
{
    if (fault == 2) {
        errno = EFBIG;
        return -1;
    }
    return ftruncate64(fd, len);
}

static int checked_fcntl(int fd, int op, int flags)
{
    if (fault == 3) {
        errno = EPERM;
        return -1;
    }
    return fcntl(fd, op, flags);
}

static void *checked_mmap(void *address, size_t len, int protection, int flags,
                          int fd, off_t offset)
{
    if (fault == 4) {
        errno = EPERM;
        return MAP_FAILED;
    }
    return mmap(address, len, protection, flags, fd, offset);
}

#define memfd_create checked_memfd
#define ftruncate64 checked_truncate
#define fcntl checked_fcntl
#define mmap checked_mmap

/* UML_MEMORY_IMPLEMENTATION */

#undef memfd_create
#undef ftruncate64
#undef fcntl
#undef mmap

static void expect_exit(pid_t child, int code)
{
    int status;
    assert(child > 0);
    assert(waitpid(child, &status, 0) == child);
    assert(WIFEXITED(status) && WEXITSTATUS(status) == code);
}

int main(int argc, char **argv)
{
    if (argc == 3 && !strcmp(argv[1], "--after-exec")) {
        errno = 0;
        assert(fcntl(atoi(argv[2]), F_GETFD) == -1 && errno == EBADF);
        return 0;
    }

    const size_t size = 16 * 1024 * 1024;
    int fd = create_mem_file(size);
    fflush(NULL);
    struct stat st;
    struct statfs fs;
    assert(fstat(fd, &st) == 0 && st.st_size == (off_t)size && st.st_nlink == 0);
    assert(fstatfs(fd, &fs) == 0 && fs.f_type == TMPFS_MAGIC);
    assert(fcntl(fd, F_GETFD) == FD_CLOEXEC);
    assert(fcntl(fd, F_GET_SEALS) == (F_SEAL_GROW | F_SEAL_SHRINK | F_SEAL_SEAL));
    assert(ftruncate(fd, size - 4096) == -1 && errno == EPERM);
    assert(ftruncate(fd, size + 4096) == -1 && errno == EPERM);
    assert(fcntl(fd, F_ADD_SEALS, F_SEAL_WRITE) == -1 && errno == EPERM);

    char *ram = mmap(NULL, 4096, PROT_READ | PROT_WRITE | PROT_EXEC, MAP_SHARED, fd, 0);
    assert(ram != MAP_FAILED);
    strcpy(ram, "parent");
    pid_t child = fork();
    assert(child >= 0);
    if (!child) {
        assert(!strcmp(ram, "parent"));
        strcpy(ram, "child");
        _exit(0);
    }
    expect_exit(child, 0);
    assert(!strcmp(ram, "child"));
    assert(munmap(ram, 4096) == 0);

    child = fork();
    assert(child >= 0);
    if (!child) {
        char value[32];
        snprintf(value, sizeof(value), "%d", fd);
        execl(argv[0], argv[0], "--after-exec", value, NULL);
        _exit(99);
    }
    expect_exit(child, 0);
    assert(close(fd) == 0);

    /* Each denied primitive exits; success or a fallback would return and fail. */
    for (int denied = 1; denied <= 4; denied++) {
        child = fork();
        assert(child >= 0);
        if (!child) {
            fault = denied;
            create_mem_file(size);
            _exit(99);
        }
        expect_exit(child, 1);
    }
    puts("UML_MEMFD_BACKING_CONTROLS_PASS anonymous_ram shared_fork fixed_size cloexec "
         "denied_create_size_seal_exec_no_fallback");
    return 0;
}
