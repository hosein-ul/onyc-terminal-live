import { saveBlob, svgToPng } from "@onyc/chart-specs/dom";
import { formatCompact, formatNumber, formatPercent, formatUsd } from "@onyc/format";
import { useWallet } from "@onyc/sdk/react";
import { Download, Search } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { shortAddress } from "../lib/format";
import { Card, Notice, PageHeader, Pill, Stat } from "../ui/kit";
import { Provenance } from "../ui/Provenance";

const SOLANA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** The card people can save and share: rank and points, nothing private. Drawn as SVG, exported as PNG. */
function ShareCard({
  address,
  rank,
  total,
  points,
}: {
  address: string;
  rank: number;
  total: number;
  points: number;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const download = async (): Promise<void> => {
    if (ref.current === null) return;
    const css = getComputedStyle(document.documentElement);
    const blob = await svgToPng(ref.current, {
      background: css.getPropertyValue("--surface").trim(),
      fontFamilies: ["Figtree"],
      scale: 2,
    });
    saveBlob(`onyc-points-${address.slice(0, 6)}.png`, blob);
  };
  return (
    <Card title="Share card" subtitle="A picture of your rank; it shows only what is public">
      <svg
        ref={ref}
        viewBox="0 0 600 315"
        width="100%"
        role="img"
        aria-label={`Rank ${rank} of ${total}, ${formatCompact(points)} points`}
        style={{ display: "block", borderRadius: 16 }}
      >
        <rect width="600" height="315" fill="var(--accent)" />
        <text x="32" y="52" fontSize="18" fontWeight="600" fill="#fff" fontFamily="var(--font-ui)">
          ONyc Terminal
        </text>
        <text
          x="32"
          y="150"
          fontSize="84"
          fontWeight="700"
          fill="#fff"
          fontFamily="var(--font-ui)"
          letterSpacing="-2"
        >
          #{rank.toLocaleString("en-US")}
        </text>
        <text x="32" y="188" fontSize="20" fill="#fff" fontFamily="var(--font-ui)">
          of {total.toLocaleString("en-US")} wallets
          {rank === 1 ? " · the top wallet" : ` · top ${formatPercent(rank / total, 1)}`}
        </text>
        <text x="32" y="250" fontSize="34" fontWeight="600" fill="#fff" fontFamily="var(--font-ui)">
          {formatCompact(points)} points
        </text>
        <text
          x="32"
          y="286"
          fontSize="15"
          fill="#fff"
          fillOpacity="0.85"
          fontFamily="var(--font-ui)"
        >
          {shortAddress(address)} · independent, not affiliated with OnRe
        </text>
      </svg>
      <p>
        <button type="button" className="btn btn-quiet" onClick={() => void download()}>
          <Download size={16} strokeWidth={1.75} aria-hidden="true" /> Download PNG
        </button>
      </p>
    </Card>
  );
}

function Lookup({ initial }: { initial: string }) {
  const navigate = useNavigate();
  const [text, setText] = useState(initial);
  const trimmed = text.trim();
  const invalid = trimmed !== "" && !SOLANA.test(trimmed);
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    if (SOLANA.test(trimmed)) void navigate(`/wallet/${trimmed}`);
  };
  return (
    <form onSubmit={submit} className="card lookup">
      <label className="field">
        Solana wallet address
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste an address"
          spellCheck={false}
          autoComplete="off"
          aria-invalid={invalid}
        />
      </label>
      <button type="submit" className="btn" disabled={!SOLANA.test(trimmed)}>
        <Search size={16} strokeWidth={2} aria-hidden="true" /> Look up
      </button>
      {invalid && (
        <Notice tone="watch">
          That is not a Solana address: it should be 32 to 44 letters and numbers, without 0, O, I
          or l.
        </Notice>
      )}
    </form>
  );
}

function Result({ address }: { address: string }) {
  const q = useWallet(address);
  const w = q.data?.data;
  if (q.isLoading)
    return (
      <Card>
        <p className="tone-neutral">Looking up {shortAddress(address)}…</p>
      </Card>
    );
  if (q.isError || w === undefined) {
    return (
      <Notice tone="bad" title="This wallet could not be looked up">
        {q.error instanceof Error ? q.error.message : "The API did not answer."} Nothing is shown
        rather than a guess.
      </Notice>
    );
  }
  if (!w.found) {
    return (
      <Notice tone="info" title="No points found for this wallet">
        OnRe's rewards API has no record of {shortAddress(address)}. It may never have held ONyc, or
        points may not have been credited yet.
      </Notice>
    );
  }
  const venues = [...w.venueTotals].sort((a, b) => b.points - a.points);
  const maxPts = Math.max(1, ...venues.map((v) => v.points));
  return (
    <>
      <div className="grid">
        <div className="span-7">
          <Card title="Points" subtitle={shortAddress(address)}>
            <div className="stats">
              <Stat
                label="Total points"
                value={w.points === null ? "—" : formatNumber(w.points, 0)}
              />
              <Stat
                label="Rank"
                value={w.rank === null ? "—" : `#${w.rank.toLocaleString("en-US")}`}
                note={
                  w.totalUsers === null ? undefined : `of ${w.totalUsers.toLocaleString("en-US")}`
                }
              />
              <Stat
                label="Percentile"
                value={w.percentile === null ? "—" : formatPercent(w.percentile, 1)}
                note="share of wallets below"
              />
              <Stat
                label="Rank change per OnRe"
                value={w.rankChangePerOnre === null ? "—" : w.rankChangePerOnre}
                note="window not documented"
              />
            </div>
            <Provenance meta={q.data?.meta["points"]} />
          </Card>
        </div>
        <div className="span-5">
          <Card title="On-chain balance">
            {w.onchain.status === "ok" ? (
              <div className="stats">
                <Stat label="ONyc held" value={formatNumber(w.onchain.onycBalance, 2)} />
                <Stat label="Value" value={formatUsd(w.onchain.valueUsd, 0)} />
              </div>
            ) : (
              <Notice
                tone="watch"
                title={
                  w.onchain.status === "unavailable" ? "Unavailable right now" : "Not configured"
                }
              >
                {w.onchain.note}
              </Notice>
            )}
          </Card>
        </div>
      </div>

      <div className="grid">
        <div className="span-7">
          <Card title="Where the points come from" subtitle="By venue">
            {venues.length === 0 ? (
              <p className="tone-neutral">No breakdown by venue is available.</p>
            ) : (
              <ul className="bars">
                {venues.map((v) => (
                  <li key={v.venue}>
                    <span>{v.venue}</span>
                    <span className="bar-track">
                      <span style={{ width: `${(v.points / maxPts) * 100}%` }} />
                    </span>
                    <b>{formatCompact(v.points)}</b>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="span-5">
          <Card title="Referrals">
            {w.referrals === null ? (
              <p className="tone-neutral">No referral data for this wallet.</p>
            ) : (
              <div className="rows">
                <div>
                  <span>Referral code</span>
                  <b>{w.referrals.code ?? "—"}</b>
                </div>
                <div>
                  <span>Total referrals</span>
                  <b>{w.referrals.totalReferrals}</b>
                </div>
                <div>
                  <span>Active</span>
                  <b>{w.referrals.activeReferrals}</b>
                </div>
                <div>
                  <span>Pending</span>
                  <b>{w.referrals.pendingReferrals}</b>
                </div>
                <div>
                  <span>Bonus earned</span>
                  <b>{formatCompact(w.referrals.totalReferralBonus)}</b>
                </div>
                <div>
                  <span>Eligible to refer</span>
                  <b>
                    {w.referrals.eligible === null ? (
                      "—"
                    ) : w.referrals.eligible ? (
                      <Pill tone="good">Yes</Pill>
                    ) : (
                      <Pill tone="neutral">No</Pill>
                    )}
                  </b>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {w.rank !== null && w.totalUsers !== null && w.points !== null && (
        <ShareCard address={address} rank={w.rank} total={w.totalUsers} points={w.points} />
      )}
    </>
  );
}

export function WalletPage() {
  const { address = "" } = useParams();
  const valid = SOLANA.test(address);
  return (
    <>
      <PageHeader
        eyebrow="Wallet Lab"
        title={
          address === ""
            ? "Look up any wallet"
            : valid
              ? `Wallet ${shortAddress(address)}`
              : "That address does not look right"
        }
      />
      <Notice tone="info">
        Paste any public address. Nothing is signed or connected: this page only reads OnRe's public
        rewards data.
      </Notice>
      <Lookup initial={address} />
      {address !== "" &&
        (valid ? (
          <Result address={address} />
        ) : (
          <Notice tone="watch">Check the address and try again.</Notice>
        ))}
    </>
  );
}
