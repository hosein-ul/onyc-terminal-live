import { Link, useLocation } from "react-router-dom";
import { shortAddress } from "./format";

/** A wallet address that opens the wallet popup on whatever page the reader is on. */
export function WalletLink({ address, full = false }: { address: string; full?: boolean }) {
  const { pathname } = useLocation();
  return (
    <Link className="mono" to={`${pathname}?wallet=${address}`} title={address}>
      {full ? address : shortAddress(address)}
    </Link>
  );
}
