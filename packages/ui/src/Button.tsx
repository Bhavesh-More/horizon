import type { ButtonHTMLAttributes } from "react";

export function Button(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-md bg-accent px-3 py-2 text-white ${props.className ?? ""}`}
    />
  );
}
