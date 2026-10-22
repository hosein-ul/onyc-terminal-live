import type { Job } from "../context.js";
import { liveJob, navHistoryJob, offersJob, redemptionJob, settingsJob } from "./core.js";
import { chainActivityJob, chainHoldersJob, chainStateJob } from "./chain.js";
import { geckoJob, llamaJob, solvencyJob } from "./market.js";
import {
  leaderboardCrawlJob,
  leaderboardTopJob,
  rewardsAumJob,
  rewardsCapitalJob,
  rewardsPointsJob,
} from "./rewards.js";
import { sheetsJob } from "./sheets.js";
import { evaluatorJob, retentionJob } from "./system.js";

export const jobs: readonly Job[] = [
  liveJob,
  navHistoryJob,
  offersJob,
  redemptionJob,
  settingsJob,
  rewardsAumJob,
  rewardsCapitalJob,
  rewardsPointsJob,
  leaderboardCrawlJob,
  leaderboardTopJob,
  sheetsJob,
  solvencyJob,
  geckoJob,
  llamaJob,
  chainStateJob,
  chainActivityJob,
  chainHoldersJob,
  evaluatorJob,
  retentionJob,
];
