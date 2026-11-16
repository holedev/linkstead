import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Joins class names, the later winning where two Tailwind classes set the same thing. */
const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));

export { cn };
