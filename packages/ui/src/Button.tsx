import type { ButtonHTMLAttributes } from "react";

export function Button(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", ...rest } = props;

  return (
    <button
      {...rest}
      className={`rounded-sm bg-btn-primary-bg px-3 py-2 text-row text-btn-primary-text ${className}`}
    />
  );
}
