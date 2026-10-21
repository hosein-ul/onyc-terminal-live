import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { createContext, createElement, useContext, type ReactNode } from "react";
import type { Client } from "./client.js";
import {
  endpoints,
  type EndpointName,
  type EndpointParams,
  type EndpointQuery,
  type EndpointResponse,
} from "./contract.js";

const ClientContext = createContext<Client | null>(null);

/** Provide the API client to the hooks below. Wrap the app in this and in a TanStack `QueryClientProvider`. */
export function ApiProvider(props: { client: Client; children?: ReactNode }): ReactNode {
  return createElement(ClientContext.Provider, { value: props.client }, props.children);
}

export function useApiClient(): Client {
  const client = useContext(ClientContext);
  if (client === null) throw new Error("useApiClient must be used inside <ApiProvider>");
  return client;
}

export interface EndpointArgs<K extends EndpointName> {
  params?: EndpointParams<K>;
  query?: EndpointQuery<K>;
  /** Set false to pause the query (for example until a wallet address is entered). */
  enabled?: boolean;
  /** Override the polling interval in ms; false turns polling off. Default: the endpoint's server cache lifetime. */
  refetchInterval?: number | false;
}

/** The query key, exported so apps can invalidate or prefetch. */
export function endpointKey<K extends EndpointName>(
  name: K,
  args?: { params?: EndpointParams<K>; query?: EndpointQuery<K> },
): readonly unknown[] {
  return ["onyc", name, args?.params ?? null, args?.query ?? null];
}

export function useEndpoint<K extends EndpointName>(
  name: K,
  args: EndpointArgs<K> = {},
): UseQueryResult<EndpointResponse<K>> {
  const client = useApiClient();
  return useQuery({
    queryKey: endpointKey(name, args),
    queryFn: ({ signal }) =>
      client.call(name, { params: args.params, query: args.query, signal } as Parameters<
        typeof client.call<K>
      >[1]),
    enabled: args.enabled ?? true,
    refetchInterval: args.refetchInterval ?? endpoints[name].ttl * 1000,
    staleTime: endpoints[name].ttl * 1000,
  });
}

type NoParams<K extends EndpointName> = Omit<EndpointArgs<K>, "params">;

export const useOverview = (a?: NoParams<"overview">) => useEndpoint("overview", a);
export const useNav = (a?: NoParams<"nav">) => useEndpoint("nav", a);
export const useNavVectors = (a?: NoParams<"navVectors">) => useEndpoint("navVectors", a);
export const useFlows = (a?: NoParams<"flows">) => useEndpoint("flows", a);
export const useMarket = (a?: NoParams<"market">) => useEndpoint("market", a);
export const useRedemptions = (a?: NoParams<"redemptions">) => useEndpoint("redemptions", a);
export const useReinsuranceLayers = (a?: NoParams<"reinsuranceLayers">) =>
  useEndpoint("reinsuranceLayers", a);
export const useReinsuranceSummary = (a?: NoParams<"reinsuranceSummary">) =>
  useEndpoint("reinsuranceSummary", a);
export const useYieldComposition = (a?: NoParams<"yieldComposition">) =>
  useEndpoint("yieldComposition", a);
export const useCapitalStack = (a?: NoParams<"capitalStack">) => useEndpoint("capitalStack", a);
export const useCapitalDistribution = (a?: NoParams<"capitalDistribution">) =>
  useEndpoint("capitalDistribution", a);
export const useCapitalReconciliation = (a?: NoParams<"capitalReconciliation">) =>
  useEndpoint("capitalReconciliation", a);
export const useDefiOpportunities = (a?: NoParams<"defiOpportunities">) =>
  useEndpoint("defiOpportunities", a);
export const usePointsGrowth = (a?: NoParams<"pointsGrowth">) => useEndpoint("pointsGrowth", a);
export const useLeaderboard = (a?: NoParams<"leaderboard">) => useEndpoint("leaderboard", a);
export const useConcentration = (a?: NoParams<"concentration">) => useEndpoint("concentration", a);
export const useSolvency = (a?: NoParams<"solvency">) => useEndpoint("solvency", a);
export const useRisk = (a?: NoParams<"risk">) => useEndpoint("risk", a);
export const useSourceHealth = (a?: NoParams<"healthSources">) => useEndpoint("healthSources", a);
export const useEvents = (a?: NoParams<"events">) => useEndpoint("events", a);

/** Wallet Lab. Pass `address: undefined` until the user has entered one. */
export const useWallet = (address: string | undefined, a?: NoParams<"wallet">) =>
  useEndpoint("wallet", {
    ...a,
    params: { address: address ?? "" },
    enabled: address !== undefined && address !== "" && (a?.enabled ?? true),
  });
