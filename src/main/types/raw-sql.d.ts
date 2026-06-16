/** Allow importing `.sql` files as raw strings via Vite's `?raw` suffix
 *  (supported by both electron-vite builds and Vitest's Vite pipeline). */
declare module '*.sql?raw' {
  const content: string
  export default content
}
