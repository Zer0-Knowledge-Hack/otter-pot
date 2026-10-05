"use client";

import Link from "next/link";
import { useTranslation } from "~~/lib/i18n";

export default function NotFound() {
  const { t } = useTranslation();

  return (
    <div className="flex items-center h-full flex-1 justify-center bg-base-200">
      <div className="text-center">
        <h1 className="text-6xl font-bold m-0 mb-1">404</h1>
        <h2 className="text-2xl font-semibold m-0">{t("notFound.title")}</h2>
        <p className="text-base-content/70 m-0 mb-4">{t("notFound.body")}</p>
        <Link href="/" className="btn btn-primary">
          {t("notFound.home")}
        </Link>
      </div>
    </div>
  );
}
