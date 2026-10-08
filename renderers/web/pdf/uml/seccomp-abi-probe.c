#define _GNU_SOURCE
#include <linux/filter.h>
#include <linux/seccomp.h>
#include <linux/audit.h>
#include <sys/prctl.h>
#include <sys/syscall.h>
#include <signal.h>
#include <ucontext.h>
#include <unistd.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
/* Linux UAPI asm-generic/siginfo.h: SYS_SECCOMP is 1. glibc 2.36 omits the name. */
#ifndef SYS_SECCOMP
#define SYS_SECCOMP 1
#endif
static volatile sig_atomic_t checked=0, passed=0;
static void handle(int sig,siginfo_t *si,void *vp){
 ucontext_t *uc=vp;
 unsigned long rax=uc->uc_mcontext.gregs[REG_RAX],ip=uc->uc_mcontext.gregs[REG_RIP];
 passed=(sig==SIGSYS && si->si_code==SYS_SECCOMP && si->si_errno==1 && si->si_syscall==SYS_getpid && si->si_arch==AUDIT_ARCH_X86_64 && rax==SYS_getpid && ip==(unsigned long)si->si_call_addr);
 char msg[768];int n=snprintf(msg,sizeof msg,"UML_SECCOMP_ABI signal=%d code=%d errno=%d syscall=%d arch=0x%x rax=%ld ip=0x%lx call=0x%lx pass=%d qualification=false\n",sig,si->si_code,si->si_errno,si->si_syscall,si->si_arch,(long)rax,ip,(unsigned long)si->si_call_addr,passed);write(1,msg,n);checked=1;
 uc->uc_mcontext.gregs[REG_RAX]=1234;
}
int main(void){
 struct sigaction sa={.sa_sigaction=handle,.sa_flags=SA_SIGINFO};sigemptyset(&sa.sa_mask);
 if(sigaction(SIGSYS,&sa,0)||prctl(PR_SET_NO_NEW_PRIVS,1,0,0,0)){perror("probe setup");return 91;}
 struct sock_filter ins[]={BPF_STMT(BPF_LD|BPF_W|BPF_ABS,offsetof(struct seccomp_data,arch)),BPF_JUMP(BPF_JMP|BPF_JEQ|BPF_K,AUDIT_ARCH_X86_64,1,0),BPF_STMT(BPF_RET|BPF_K,SECCOMP_RET_KILL_PROCESS),BPF_STMT(BPF_LD|BPF_W|BPF_ABS,offsetof(struct seccomp_data,nr)),BPF_JUMP(BPF_JMP|BPF_JEQ|BPF_K,SYS_getpid,0,1),BPF_STMT(BPF_RET|BPF_K,SECCOMP_RET_TRAP|1),BPF_STMT(BPF_RET|BPF_K,SECCOMP_RET_ALLOW)};
 struct sock_fprog f={sizeof ins/sizeof ins[0],ins};
 if(prctl(PR_SET_SECCOMP,SECCOMP_MODE_FILTER,&f)){perror("probe seccomp");return 92;}
 long result=syscall(SYS_getpid);printf("UML_SECCOMP_ABI_RESULT checked=%d pass=%d injectedResult=%ld\n",checked,passed,result);return (checked && passed && result==1234)?0:93;
}
