import { Md } from "@m2d/react-markdown/client";
import DOMPurify from "dompurify";
import { Suspense, use, useCallback, useMemo, useRef, useState, type FC } from "react";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import type { BundledLanguage, Highlighter } from "shiki";

import { cn } from "@/lib/utils";

const PRELOADED_LANGS: BundledLanguage[] = [
  "javascript",
  "typescript",
  "jsx",
  "tsx",
  "json",
  "html",
  "css",
  "bash",
  "shell",
  "python",
  "go",
  "rust",
  "yaml",
  "markdown",
  "diff",
  "sql",
  "graphql",
  "ruby",
  "java",
  "c",
  "cpp",
  "swift",
  "kotlin",
  "dockerfile",
  "toml",
];

const highlighterPromise: Promise<Highlighter> =
  typeof window !== "undefined"
    ? import("shiki").then((shiki) =>
        shiki.createHighlighter({
          themes: ["github-light", "github-dark"],
          langs: PRELOADED_LANGS,
        }),
      )
    : new Promise<Highlighter>(() => {});

const htmlCache = new Map<string, Promise<string>>();

export function highlightCode(code: string, lang: string): Promise<string> {
  const key = `${lang}:${code}`;
  const cached = htmlCache.get(key);
  if (cached) return cached;

  const promise = highlighterPromise.then(async (highlighter) => {
    let effectiveLang = lang;
    if (!highlighter.getLoadedLanguages().includes(lang as BundledLanguage)) {
      try {
        await highlighter.loadLanguage(lang as BundledLanguage);
      } catch {
        effectiveLang = "text";
      }
    }
    return highlighter.codeToHtml(code, {
      lang: effectiveLang,
      themes: { light: "github-light", dark: "github-dark" },
      defaultColor: false,
    });
  });
  htmlCache.set(key, promise);
  return promise;
}

function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleClick = useCallback(() => {
    void navigator.clipboard.writeText(code);
    setCopied(true);
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), 1500);
  }, [code]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className="bg-surface-elevated text-muted-foreground hover:bg-accent hover:text-foreground absolute top-2 right-2 flex size-7 items-center justify-center rounded-md opacity-0 transition-all group-hover/code:opacity-100"
    >
      {copied ? (
        <svg
          width={14}
          height={14}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg
          width={14}
          height={14}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

function ShikiCodeInner({ code, lang }: { code: string; lang: string }) {
  const html = use(highlightCode(code, lang));

  return (
    <div className="group/code relative mb-2 [&_pre]:mb-0 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border/60 [&_pre]:bg-background [&_pre]:p-3 [&_pre]:text-xs">
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: shiki output is trusted */}
      <div dangerouslySetInnerHTML={{ __html: html }} />
      <CopyButton code={code} />
    </div>
  );
}

function ShikiCode({ code, lang }: { code: string; lang: string }) {
  return (
    <Suspense
      fallback={
        <div className="group/code relative mb-2">
          <pre className="bg-surface border-border/60 overflow-x-auto rounded-lg border p-3 text-xs">
            <code>{code}</code>
          </pre>
        </div>
      }
    >
      <ShikiCodeInner code={code} lang={lang} />
    </Suspense>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- markdown component overrides receive broad union props
const components: Record<string, FC<any>> = {
  h1: ({ node: _, children, ...props }) => (
    <h1 className="mt-5 mb-3 text-2xl font-semibold tracking-tight first:mt-0" {...props}>
      {children}
    </h1>
  ),
  h2: ({ node: _, children, ...props }) => (
    <h2 className="mt-4 mb-2 text-xl font-semibold tracking-tight first:mt-0" {...props}>
      {children}
    </h2>
  ),
  h3: ({ node: _, children, ...props }) => (
    <h3 className="mt-3 mb-2 text-lg font-semibold tracking-tight first:mt-0" {...props}>
      {children}
    </h3>
  ),
  h4: ({ node: _, children, ...props }) => (
    <h4 className="mt-3 mb-1.5 text-base font-semibold first:mt-0" {...props}>
      {children}
    </h4>
  ),
  p: ({ node: _, children, ...props }) => (
    <p className="mb-2 text-sm leading-relaxed last:mb-0" {...props}>
      {children}
    </p>
  ),
  a: ({ node: _, children, href, ...props }) => (
    <a
      href={href}
      className="decoration-border hover:decoration-foreground text-sm font-medium underline underline-offset-2 transition-colors"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  ),
  ul: ({ node: _, children, ...props }) => (
    <ul className="mb-2 flex list-disc flex-col gap-0.5 pl-5 text-sm" {...props}>
      {children}
    </ul>
  ),
  ol: ({ node: _, children, ...props }) => (
    <ol className="mb-2 flex list-decimal flex-col gap-0.5 pl-5 text-sm" {...props}>
      {children}
    </ol>
  ),
  li: ({ node: _, children, ...props }) => (
    <li className="text-sm leading-relaxed" {...props}>
      {children}
    </li>
  ),
  blockquote: ({ node: _, children, ...props }) => (
    <blockquote
      className="border-border mb-2 border-l-2 pl-3 text-sm text-muted-foreground italic"
      {...props}
    >
      {children}
    </blockquote>
  ),
  code: ({ node: _, children, className, ...props }) => {
    const langMatch = className?.match(/language-(\w+)/);
    if (langMatch) {
      const code = String(children).replace(/\n$/, "");
      return <ShikiCode code={code} lang={langMatch[1]} />;
    }
    return (
      <code className="bg-surface rounded-md px-1.5 py-0.5 font-mono text-xs" {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children, node, ...props }) => {
    const codeChild = node?.children?.[0];
    if (
      codeChild?.type === "element" &&
      codeChild.tagName === "code" &&
      Array.isArray(codeChild.properties?.className) &&
      (codeChild.properties.className as string[]).some((c) => String(c).startsWith("language-"))
    ) {
      return <>{children}</>;
    }
    return (
      <pre className="bg-surface border-border/60 mb-2 overflow-x-auto rounded-lg border p-3 text-xs" {...props}>
        {children}
      </pre>
    );
  },
  hr: ({ node: _, ...props }) => <hr className="border-border my-4" {...props} />,
  img: ({ node: _, alt, ...props }) => (
    <img className="my-2 inline-block max-w-full rounded-lg" alt={alt} {...props} />
  ),
  table: ({ node: _, children, ...props }) => (
    <div className="bg-surface mb-2 overflow-hidden rounded-lg border border-border">
      <table className="w-full border-collapse text-sm" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ node: _, children, ...props }) => (
    <thead className="bg-muted/40" {...props}>
      {children}
    </thead>
  ),
  th: ({ node: _, children, ...props }) => (
    <th
      className="border-border/50 text-muted-foreground last:border-r-0 border-r border-b px-3 py-1.5 text-left text-xs font-medium"
      {...props}
    >
      {children}
    </th>
  ),
  td: ({ node: _, children, ...props }) => (
    <td
      className="border-border/50 last:border-r-0 [tr:last-child_&]:border-b-0 border-r border-b px-3 py-1.5 text-xs"
      {...props}
    >
      {children}
    </td>
  ),
  input: ({ node: _, type, checked, ...props }) => {
    if (type === "checkbox") {
      return (
        <input
          type="checkbox"
          checked={checked}
          readOnly
          className="border-border mr-1.5 rounded"
          {...props}
        />
      );
    }
    return <input type={type} {...props} />;
  },
  strong: ({ node: _, children, ...props }) => (
    <strong className="font-semibold" {...props}>
      {children}
    </strong>
  ),
  em: ({ node: _, children, ...props }) => (
    <em className="italic" {...props}>
      {children}
    </em>
  ),
  del: ({ node: _, children, ...props }) => (
    <del className="text-muted-foreground line-through" {...props}>
      {children}
    </del>
  ),
  details: ({ node: _, children, ...props }) => (
    <details className="group/details mb-2 text-sm [&>:not(summary)]:mt-2" {...props}>
      {children}
    </details>
  ),
  summary: ({ node: _, children, ...props }) => (
    <summary
      className="bg-background border-border hover:bg-accent flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium select-none [&::-webkit-details-marker]:hidden"
      {...props}
    >
      <svg
        className="text-muted-foreground group-open/details:rotate-90 size-3.5 shrink-0 transition-transform"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 4l4 4-4 4" />
      </svg>
      {children}
    </summary>
  ),
};

export function Markdown({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  const safeMarkdown = useMemo(
    () =>
      DOMPurify.sanitize(children, {
        USE_PROFILES: { html: true },
      }),
    [children],
  );

  return (
    <div className={cn("text-foreground", className)}>
      <Md remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={components}>
        {safeMarkdown}
      </Md>
    </div>
  );
}
