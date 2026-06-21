// Raw GLSL shader sources are imported as strings via vite-plugin-string.
declare module '*.vert' {
  const source: string;
  export default source;
}
declare module '*.frag' {
  const source: string;
  export default source;
}
