"use client";

import type { ReactNode, SelectHTMLAttributes } from "react";

// The one select in the app: native element for accessibility, custom chevron inset from the edge,
// and right padding so the value never runs under it.

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  children: ReactNode;
}

export function Select({ className, children, ...props }: SelectProps) {
  return (
    <span className={`select${className ? ` ${className}` : ""}`}>
      <select {...props}>{children}</select>
      <svg className="select-chevron" viewBox="0 0 12 12" aria-hidden="true">
        <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
