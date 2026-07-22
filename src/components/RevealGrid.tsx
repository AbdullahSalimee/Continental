"use client";

import { motion } from "framer-motion";
import { ReactNode, Children } from "react";

export default function RevealGrid({ children }: { children: ReactNode }) {
  const items = Children.toArray(children);
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((child, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: i * 0.05, ease: "easeOut" }}
        >
          {child}
        </motion.div>
      ))}
    </div>
  );
}
