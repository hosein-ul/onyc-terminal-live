import { BASIS_LABEL, sortedTerms } from "@onyc/glossary";
import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Card, EmptyState, ExternalLink, PageHeader, Pill } from "../ui/kit";

/** Every term the site uses, in plain language, with where each definition comes from. */
export function GlossaryPage() {
  const [q, setQ] = useState("");
  const { hash } = useLocation();
  const terms = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return sortedTerms().filter(
      (t) =>
        needle === "" ||
        `${t.term} ${t.aliases.join(" ")} ${t.short} ${t.why}`.toLowerCase().includes(needle),
    );
  }, [q]);

  useEffect(() => {
    if (hash === "") return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [hash]);

  return (
    <>
      <PageHeader eyebrow="Reference" title="Glossary" />
      <p className="lede page-lede">
        Plain-language meanings of the terms on this site. Each entry says whether OnRe states it,
        whether it is this tool's own method, or whether it is the ordinary meaning of the word.
      </p>
      <label className="dt-search">
        <Search size={16} aria-hidden="true" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search terms"
          aria-label="Search the glossary"
        />
        <span className="dt-count">{terms.length} terms</span>
      </label>
      {terms.length === 0 ? (
        <EmptyState title="No term matches" />
      ) : (
        <div className="glossary">
          {terms.map((t) => (
            <Card key={t.id} className="gloss-entry">
              <h2 id={t.id} className="gloss-term">
                {t.term}
                <Pill tone={t.basis === "onre" ? "accent" : "neutral"}>{BASIS_LABEL[t.basis]}</Pill>
              </h2>
              <p className="gloss-short">{t.short}</p>
              <p className="gloss-why">
                <b>Why it matters:</b> {t.why}
              </p>
              {t.note !== undefined && <p className="gloss-note">{t.note}</p>}
              {t.source !== undefined && (
                <p>
                  <ExternalLink href={t.source.url}>{t.source.label}</ExternalLink>
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
