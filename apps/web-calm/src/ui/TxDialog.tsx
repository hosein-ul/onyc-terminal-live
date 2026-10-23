import { formatRelativeAge } from "@onyc/format";
import { useChainTx } from "@onyc/sdk/react";
import { ExternalLink as ExternalIcon, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { shortAddress } from "../lib/format";
import { WalletLink } from "../lib/wallet";
import { eventLabel, solscanTx } from "./ChainFeed";
import { Skeleton } from "./kit";

const SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,100}$/;

/** Core Solana programs that appear in nearly every transaction. */
const CORE_PROGRAMS: Record<string, string> = {
  "11111111111111111111111111111111": "System program",
  TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: "Token program",
  ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL: "Associated token account program",
  ComputeBudget111111111111111111111111111111: "Compute budget",
};

const amount = (n: number): string =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: Math.abs(n) < 10 ? 4 : 2 }).format(n);

const when = (iso: string | null): string =>
  iso === null
    ? "—"
    : `${new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "medium" })} · ${formatRelativeAge(iso)}`;

function Body({ signature }: { signature: string }) {
  const q = useChainTx(signature);
  if (q.isLoading) return <Skeleton height={220} />;
  if (q.isError || q.data === undefined)
    return <p className="tone-bad">The transaction could not be read. Try again in a moment.</p>;
  const tx = q.data.data.tx;
  if (!q.data.data.found || tx === null)
    return (
      <p className="tone-neutral">Solana has no finalized transaction with this signature yet.</p>
    );
  const what =
    tx.event === null
      ? "Transaction"
      : eventLabel({ kind: tx.event.kind, venue: tx.event.venue, venueKind: tx.event.venueKind });
  return (
    <>
      <dl className="txd-facts">
        <div>
          <dt>What</dt>
          <dd>
            {what}
            {tx.event?.instruction != null && (
              <small className="mono"> {tx.event.instruction}</small>
            )}
          </dd>
        </div>
        <div>
          <dt>When</dt>
          <dd>{when(tx.ts)}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd className={tx.ok ? "tone-good" : "tone-bad"}>{tx.ok ? "Succeeded" : "Failed"}</dd>
        </div>
        <div>
          <dt>Signer</dt>
          <dd>
            {tx.signer === null ? (
              "—"
            ) : (
              <>
                <WalletLink address={tx.signer} />
                {tx.signerLabel !== null && <small> {tx.signerLabel}</small>}
              </>
            )}
          </dd>
        </div>
        <div>
          <dt>Fee</dt>
          <dd>
            {new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(tx.feeSol)} SOL
          </dd>
        </div>
        <div>
          <dt>Slot</dt>
          <dd>{new Intl.NumberFormat("en-US").format(tx.slot)}</dd>
        </div>
      </dl>

      <section aria-label="Token movements">
        <h3>Token movements</h3>
        {tx.transfers.length === 0 ? (
          <p className="tone-neutral">No token balance changed.</p>
        ) : (
          <table className="mini">
            <thead>
              <tr>
                <th>Account owner</th>
                <th>Token</th>
                <th className="num">Change</th>
                <th className="num">Balance after</th>
              </tr>
            </thead>
            <tbody>
              {tx.transfers.map((t, i) => (
                <tr key={`${t.mint}-${t.owner ?? ""}-${i}`}>
                  <td>
                    {t.owner === null ? "—" : <WalletLink address={t.owner} />}
                    {t.label !== null && <small> {t.label}</small>}
                  </td>
                  <td title={t.mint}>{t.token ?? shortAddress(t.mint)}</td>
                  <td className={`num ${t.change > 0 ? "tone-good" : "tone-bad"}`}>
                    {t.change > 0 ? "+" : "−"}
                    {amount(Math.abs(t.change))}
                  </td>
                  <td className="num">{amount(t.after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section aria-label="Programs called">
        <h3>Programs called</h3>
        <ul className="txd-programs">
          {tx.programs.map((p) => (
            <li key={p.address}>
              <b>{p.label ?? CORE_PROGRAMS[p.address] ?? shortAddress(p.address)}</b>
              {(p.label !== null || CORE_PROGRAMS[p.address] !== undefined) && (
                <small className="mono">{shortAddress(p.address)}</small>
              )}
              {p.instructions.length > 0 && (
                <span className="mono">{p.instructions.join(", ")}</span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

/** A popup with one transaction read from Solana. It lives in the address bar (?tx=), so it can be shared. */
export function TxDialog() {
  const [params, setParams] = useSearchParams();
  const signature = params.get("tx");
  const close = useRef<HTMLButtonElement>(null);

  const dismiss = (): void => {
    const next = new URLSearchParams(params);
    next.delete("tx");
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if (signature === null) return undefined;
    close.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        const next = new URLSearchParams(window.location.search);
        next.delete("tx");
        setParams(next, { replace: true });
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [signature, setParams]);

  if (signature === null) return null;
  const valid = SIGNATURE.test(signature);
  return (
    <div className="wd-wrap">
      <button type="button" className="wd-scrim" aria-label="Close" onClick={dismiss} />
      <div className="wd txd" role="dialog" aria-modal="true" aria-label="Transaction details">
        <header>
          <div>
            <small>Transaction</small>
            <h2 className="mono" title={signature}>
              {valid ? shortAddress(signature) : "Not a valid signature"}
            </h2>
          </div>
          <div className="wd-actions">
            {valid && (
              <a
                className="btn btn-quiet"
                href={solscanTx(signature)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Solscan <ExternalIcon size={14} aria-hidden="true" />
              </a>
            )}
            <button ref={close} type="button" className="icon-btn" onClick={dismiss}>
              <X size={18} aria-hidden="true" />
              <span className="sr-only">Close</span>
            </button>
          </div>
        </header>
        {valid ? <Body signature={signature} /> : <p>Check the signature and try again.</p>}
        <p className="wd-foot">Read from Solana when opened. Names come from our holder labels.</p>
      </div>
    </div>
  );
}
