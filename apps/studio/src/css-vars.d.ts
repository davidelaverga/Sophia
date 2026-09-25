// Custom properties in React's `style` prop (e.g. a presence's row around the light).
export type CssVariable = `--${string}`

declare module 'react' {
  interface CSSProperties {
    [property: CssVariable]: string | number | undefined
  }
}
