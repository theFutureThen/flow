import { z } from 'zod';

/**
 * 插件层级（spec §7）：
 * - L0 声明式：宿主解释执行，不运行任意代码，结构性免审
 * - L1 沙箱：沙箱渲染上下文，无 Node，白名单 API
 * - L2 特权：独立 utilityProcess，受控 Node，强制开源 + 审核 + 签名
 */
export const TIERS = ['L0', 'L1', 'L2'] as const;
export type Tier = (typeof TIERS)[number];

export const tierSchema = z.enum(TIERS);

/** 未显式声明层级的插件按 L1 处理（spec §7.2） */
export const DEFAULT_TIER: Tier = 'L1';

export const CAPABILITIES = [
  'storage',
  'notification',
  'clipboard',
  'http',
  'fs',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/**
 * 各层能力集。这是白名单而非黑名单——新增能力必须显式加入某层，
 * 遗漏时默认不可用（spec §7.2）。
 *
 * L0 为空数组不是遗漏：它不执行任意代码，能力上限由宿主解释器
 * 决定，不通过能力集授予。
 */
const TIER_CAPABILITIES: Readonly<Record<Tier, readonly Capability[]>> = {
  L0: [],
  L1: ['storage', 'notification', 'clipboard', 'http'],
  L2: ['storage', 'notification', 'clipboard', 'http', 'fs'],
};

export function capabilitiesForTier(tier: Tier): readonly Capability[] {
  return TIER_CAPABILITIES[tier];
}
