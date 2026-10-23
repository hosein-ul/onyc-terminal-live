import { instructionDiscriminator } from "./layouts.js";

/**
 * What a program transaction did, in the words of the activity feed. The instruction names are the `pub fn` list of
 * programs/onreapp/src/lib.rs in github.com/onre-finance/onre-sol; Anchor identifies an instruction by the first 8 bytes of
 * sha256("global:<name>"), so the table is computed, not copied.
 */
export type ChainEventKind =
  | "mint"
  | "redeem_request"
  | "redeem_cancelled"
  | "redeem_fulfilled"
  | "propamm_sell"
  | "propamm_buy"
  | "price_vector"
  | "admin_config"
  | "vault_move"
  | "market_stats"
  | "large_transfer"
  | "venue_in"
  | "venue_out";

const NAMES: Record<ChainEventKind, string[]> = {
  mint: [
    "take_offer",
    "take_offer_v2",
    "take_offer_permissionless",
    "take_offer_permissionless_v2",
    "mint_to",
  ],
  redeem_request: ["create_redemption_request"],
  redeem_cancelled: ["cancel_redemption_request"],
  redeem_fulfilled: ["fulfill_redemption_request"],
  propamm_sell: ["open_swap_sell"],
  propamm_buy: ["open_swap_buy"],
  price_vector: [
    "add_offer_vector",
    "delete_offer_vector",
    "delete_all_offer_vectors",
    "make_offer",
  ],
  vault_move: [
    "offer_vault_deposit",
    "offer_vault_withdraw",
    "redemption_vault_deposit",
    "redemption_vault_withdraw",
    "withdraw_configurable_vault",
    "set_configurable_vault_destination",
    "deposit_reserve_vault",
    "withdraw_reserve_vault",
  ],
  market_stats: [
    "refresh_market_stats",
    "set_circulating_supply_excluded_accounts",
    "update_circulating_supply_excluded_balance",
  ],
  admin_config: [
    "initialize",
    "initialize_permissionless_authority",
    "update_offer_fee",
    "update_offer_permissionless_fee",
    "update_redemption_offer_prop_amm_sell_fee",
    "update_redemption_offer_fee",
    "update_redemption_offer_vault_target",
    "set_offer_disabled",
    "set_redemption_offer_disabled",
    "make_redemption_offer",
    "propose_boss",
    "accept_boss",
    "add_admin",
    "remove_admin",
    "clear_admins",
    "transfer_mint_authority_to_program",
    "transfer_mint_authority_to_boss",
    "set_kill_switch",
    "set_onyc_mint",
    "set_worker",
    "initialize_buffer",
    "settle_buffer",
    "set_main_offer",
    "configure_prop_amm",
    "set_buffer_gross_apr",
    "set_buffer_fee_config",
    "burn_for_nav_increase",
    "add_approver",
    "remove_approver",
    "configure_max_supply",
    "configure_max_mint_amount",
    "close_state",
  ],
  large_transfer: [],
  venue_in: [],
  venue_out: [],
};

const key = (d: Uint8Array): string => Buffer.from(d).toString("hex");

const BY_DISCRIMINATOR = new Map<string, { name: string; kind: ChainEventKind }>();
for (const [kind, names] of Object.entries(NAMES) as [ChainEventKind, string[]][]) {
  for (const name of names)
    BY_DISCRIMINATOR.set(key(instructionDiscriminator(name)), { name, kind });
}

export function identifyInstruction(
  discriminator: Uint8Array | null,
): { name: string; kind: ChainEventKind } | null {
  return discriminator === null ? null : (BY_DISCRIMINATOR.get(key(discriminator)) ?? null);
}

/** Instruction kinds in the order they matter when one transaction holds several: the most informative first. */
export const KIND_PRIORITY: ChainEventKind[] = [
  "redeem_fulfilled",
  "redeem_request",
  "redeem_cancelled",
  "propamm_sell",
  "propamm_buy",
  "mint",
  "price_vector",
  "admin_config",
  "vault_move",
  "market_stats",
];
