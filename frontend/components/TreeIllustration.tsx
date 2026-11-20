import Image from "next/image";
import { FallingPetals } from "@/components/FallingPetals";
import { AnimatedRope } from "@/components/AnimatedRope";

export function TreeIllustration() {
  return (
    <div
      className="tree-illustration"
      style={{
        position: "relative",
        background: "transparent",
      }}
    >
      <Image
        src="/images/cherry-tree.png"
        alt=""
        aria-hidden="true"
        width={3072}
        height={1712}
        priority
        sizes="(max-width: 900px) 100vw, 610px"
        style={{
          width: "100%",
          height: "auto",
          maxHeight: "inherit",
          objectFit: "contain",
          display: "block",
          background: "transparent",
        }}
      />
      <AnimatedRope />
      <FallingPetals />
    </div>
  );
}
