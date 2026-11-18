export function TreeIllustration() {
  return (
    <svg aria-label="A growing tree with a path becoming solid" className="tree-illustration" role="img" viewBox="0 0 560 340">
      <defs>
        <linearGradient id="canopy" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#D7EFF4" stopOpacity=".96" />
          <stop offset="1" stopColor="#D7EFF4" stopOpacity=".46" />
        </linearGradient>
      </defs>
      <path className="tree-ground" d="M45 300c125-24 228-14 327-1 48 6 94 4 144-8" />
      <path className="tree-trunk" d="M278 286c-3-54 1-101-5-144m4 91 56-46m-55 16-48-43" />
      <path className="tree-branch" d="M333 186v-31m-105 5v-31" />
      <path className="tree-path tree-path-dotted" d="M56 272c80-10 115-41 174-52s104 4 158-32 73-43 119-44" />
      <path className="tree-path tree-path-solid" d="M56 272c80-10 115-41 174-52s104 4 158-32 73-43 119-44" />
      <circle className="tree-leaf leaf-one" cx="230" cy="103" r="45" />
      <circle className="tree-leaf leaf-two" cx="280" cy="82" r="54" />
      <circle className="tree-leaf leaf-three" cx="331" cy="111" r="45" />
      <circle className="tree-leaf leaf-four" cx="268" cy="137" r="46" />
      <circle className="tree-fruit" cx="314" cy="79" r="8" />
      <circle className="tree-fruit tree-fruit-two" cx="240" cy="127" r="6" />
    </svg>
  );
}
