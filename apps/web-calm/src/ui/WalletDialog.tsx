import { formatCompact, formatNumber, formatPercent, formatUsdCompact } from "@onyc/format";
import { useWallet } from "@onyc/sdk/react";
import { ExternalLink as ExternalIcon, Search, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { shortAddress } from "../lib/format";
import { Named } from "./Badge";
import { solscanAccount } from "./ChainFeed";
import { Skeleton } from "./kit";

export const SOLANA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** The search box of the top line: paste a Solana address, and the popup opens on the page you are on. */
export function WalletSearch() {
  const [text, setText] = useState("");
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const t = text.trim();
  const bad = t !== "" && !SOLANA.test(t);
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    if (!SOLANA.test(t)) return;
    void navigate(`${pathname}?wallet=${t}`);
    setText("");
  };
  return (
    <form className="wsearch" onSubmit={submit} role="search">
      <Search size={16} strokeWidth={1.75} aria-hidden="true" />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Search a wallet address"
        aria-label="Search a wallet address"
        aria-invalid={bad}
        spellCheck={false}
        autoComplete="off"
      />
      {bad && <span className="wsearch-bad">Not a Solana address</span>}
    </form>
  );
}

function Body({ address }: { address: string }) {
  const q = useWallet(address);
  const w = q.data?.data;
  if (q.isLoading) return <Skeleton height={180} />;
  if (q.isError || w === undefined)
    return <p className="tone-bad">The lookup failed. Try again in a moment.</p>;
  const venues = [...w.venueTotals].sort((a, b) => b.points - a.points).filter((v) => v.points > 0);
  const top = venues[0]?.points ?? 0;
  return (
    <>
      <div className="wd-stats">
        <div>
          <span>ONyc on chain</span>
          <b>{w.onchain.onycBalance === null ? "—" : formatCompact(w.onchain.onycBalance)}</b>
          <small>
            {w.onchain.valueUsd === null
              ? "balance not available"
              : `≈ ${formatUsdCompact(w.onchain.valueUsd)}`}
          </small>
        </div>
        <div>
          <span>Points</span>
          <b>{w.found ? formatCompact(w.points) : "—"}</b>
          <small>{w.found ? "all venues" : "none recorded"}</small>
        </div>
        <div>
          <span>Rank</span>
          <b>{w.rank === null ? "—" : `#${formatNumber(w.rank, 0)}`}</b>
          <small>
            {w.totalUsers === null
              ? ""
              : `of ${formatCompact(w.totalUsers)}${w.percentile === null ? "" : ` · top ${formatPercent(Math.max(0.001, 1 - w.percentile), 1)}`}`}
          </small>
        </div>
      </div>
      {venues.length > 0 && (
        <section aria-label="Points by venue">
          <h3>Points by venue</h3>
          <ul className="wd-venues">
            {venues.map((v) => (
              <li key={v.venue}>
                <Named name={v.venue} size={20} />
                <span className="wd-bar" aria-hidden="true">
                  <i style={{ width: `${top > 0 ? Math.max(3, (v.points / top) * 100) : 0}%` }} />
                </span>
                <b>{formatCompact(v.points)}</b>
              </li>
            ))}
          </ul>
        </section>
      )}
      {w.referrals !== null && w.referrals.totalReferrals > 0 && (
        <p className="wd-line">
          <span>Referrals</span>
          <b>
            {w.referrals.totalReferrals} ({w.referrals.activeReferrals} active)
          </b>
        </p>
      )}
      {w.rankChangePerOnre !== null && w.rankChangePerOnre !== 0 && (
        <p className="wd-line">
          <span>Rank change per OnRe</span>
          <b>
            {w.rankChangePerOnre > 0 ? "+" : w.rankChangePerOnre < 0 ? "−" : ""}
            {Math.abs(w.rankChangePerOnre)}
          </b>
        </p>
      )}
    </>
  );
}

/** A popup with everything known about one address. It lives in the address bar (?wallet=), so it can be shared. */
export function WalletDialog() {
  const [params, setParams] = useSearchParams();
  const address = params.get("wallet");
  const close = useRef<HTMLButtonElement>(null);

  const dismiss = (): void => {
    const next = new URLSearchParams(params);
    next.delete("wallet");
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if (address === null) return undefined;
    close.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        const next = new URLSearchParams(window.location.search);
        next.delete("wallet");
        setParams(next, { replace: true });
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [address, setParams]);

  if (address === null) return null;
  const valid = SOLANA.test(address);
  return (
    <div className="wd-wrap">
      <button type="button" className="wd-scrim" aria-label="Close" onClick={dismiss} />
      <div className="wd" role="dialog" aria-modal="true" aria-label="Wallet details">
        <header>
          <div>
            <small>Wallet</small>
            <h2 className="mono" title={address}>
              {valid ? shortAddress(address) : "Not a valid address"}
            </h2>
          </div>
          <div className="wd-actions">
            {valid && (
              <a
                className="btn btn-quiet"
                href={solscanAccount(address)}
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
        {valid ? <Body address={address} /> : <p>Check the address and try again.</p>}
        <p className="wd-foot">Read-only: public rewards data and the chain balance.</p>
      </div>
    </div>
  );
}
