import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "~~/utils/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-otter-action/60",
  {
    variants: {
      variant: {
        primary: "bg-otter-action text-white hover:brightness-110",
        secondary:
          "bg-transparent text-otter-text border border-otter-border hover:border-otter-action/50 hover:bg-otter-action/5",
        ghost: "bg-transparent text-otter-muted hover:text-otter-text hover:bg-otter-card",
        telegram: "bg-[#229ED9] text-white hover:brightness-110",
      },
      size: {
        sm: "h-9 px-3.5 text-sm",
        md: "h-11 px-5 text-sm",
        lg: "h-12 px-6 text-[15px]",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
