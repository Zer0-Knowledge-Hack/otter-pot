import React from "react";
import Link from "next/link";

interface CardProps {
  icon: React.ReactNode;
  description: React.ReactNode;
  linkHref: string;
  linkText: string;
  isDarkMode: boolean;
}

export const Card: React.FC<CardProps> = ({ icon, description, linkHref, linkText, isDarkMode }) => {
  return (
    <div
      className={`relative h-full rounded-3xl border-2 border-transparent p-4 text-center flex flex-col items-center justify-evenly max-w-md ${
        isDarkMode ? "gradient-border-red" : "gradient-border-light"
      }`}
      style={{
        boxShadow: "0 0 0 3px transparent",
      }}
    >
      <div className="absolute top-0 left-1/2 -translate-x-1/2">
        <svg xmlns="http://www.w3.org/2000/svg" width="84" height="6" viewBox="0 0 84 6" fill="none">
          <path d="M41.3071 6L15.6728 6L0 0L84 0L69.02 6L41.3071 6Z" fill="#E3066E" />
        </svg>
      </div>
      <div>{icon}</div>
      <p className="text-sm">
        {description}
        <br />
        <Link href={linkHref} passHref className="underline underline-offset-4 font-semibold">
          {linkText}
        </Link>{" "}
        tab.
      </p>
    </div>
  );
};

export default Card;
