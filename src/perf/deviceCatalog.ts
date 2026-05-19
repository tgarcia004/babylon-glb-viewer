/**
 * Device tiers for the viewport performance indicator.
 * Classified by GPU/CPU generation and typical RAM — aligned with your iPad/iPhone field data.
 */

export type DeviceFamily = "portable" | "desktop";

export interface DeviceTierProfile {
  id: string;
  family: DeviceFamily;
  /** e.g. "Old" within portable */
  tierName: string;
  label: string;
  yearRange: string;
  chipNote: string;
  ramNote: string;
  /** What “old / medium / new” means in plain language */
  summary: string;
  examples: string[];
}

/** Portable tiers — tablets & phones (WebGL in Safari / Chrome) */
export const PORTABLE_TIERS: DeviceTierProfile[] = [
  {
    id: "portable-old",
    family: "portable",
    tierName: "Old",
    label: "Portable · old",
    yearRange: "2014 – 2019",
    chipNote: "A8X – A12 (≤6-core CPU)",
    ramNote: "2 – 4 GB",
    summary: "Legacy iPads & phones before A14 / before M-series. Tight GPU memory and slower WebGL.",
    examples: [
      "iPad Air 2",
      "iPad (5th gen)",
      "iPad (6th gen)",
      "iPad Pro (10.5″)",
      "iPad Air (3rd gen)",
      "iPhone XR",
    ],
  },
  {
    id: "portable-medium",
    family: "portable",
    tierName: "Medium",
    label: "Portable · medium",
    yearRange: "2020 – 2022",
    chipNote: "A14 – A15, A12Z",
    ramNote: "4 – 6 GB",
    summary: "Still common in the field (e.g. iPad Air 4th). Fine for moderate scenes; heavy shell stacks struggle.",
    examples: [
      "iPad Air (4th gen) · A14",
      "iPad (8th / 9th / 10th gen)",
      "iPhone 12 · 13 · 14",
      "iPhone 12 Pro",
    ],
  },
  {
    id: "portable-new",
    family: "portable",
    tierName: "New",
    label: "Portable · new",
    yearRange: "2022 – 2025",
    chipNote: "M1 – M3, A16 – A19 Pro",
    ramNote: "8 – 12 GB",
    summary: "Current Apple Silicon tablets & flagship phones. Best target for rich fur / many shell meshes.",
    examples: [
      "iPad Air (5th gen) · M1",
      "iPad Air (6th / 7th gen) · M2 / M3",
      "iPad Air 11″ (M3)",
      "iPad Pro (11″ / 12.9″)",
      "iPad (A16)",
      "iPhone 15 Pro · A17 Pro",
      "iPhone 17 Pro · A19 Pro",
    ],
  },
];

/** Desktop / laptop tiers — discrete or strong iGPU */
export const DESKTOP_TIERS: DeviceTierProfile[] = [
  {
    id: "desktop-old",
    family: "desktop",
    tierName: "Old",
    label: "Desktop · old",
    yearRange: "2015 – 2018",
    chipNote: "Intel 6th–8th gen · HD 520–630",
    ramNote: "4 – 8 GB",
    summary: "Office PCs & old laptops. WebGL is usable but fur-quality shell stacks fill the GPU quickly.",
    examples: [
      "Intel HD 520 / 620 laptops",
      "8 GB DDR3 office desktops",
      "MacBook Air 2017",
    ],
  },
  {
    id: "desktop-medium",
    family: "desktop",
    tierName: "Medium",
    label: "Desktop · medium",
    yearRange: "2019 – 2022",
    chipNote: "GTX 1650 · RX 5500 · M1 base",
    ramNote: "8 – 16 GB",
    summary: "Mainstream creative laptops & M1 Macs. Good for product review; cap shell count on huge GLBs.",
    examples: [
      "GTX 1650 / RTX 2050 laptops",
      "MacBook Air / Pro M1 (8 GB)",
      "AMD Ryzen 5 + integrated Vega",
    ],
  },
  {
    id: "desktop-new",
    family: "desktop",
    tierName: "New",
    label: "Desktop · new",
    yearRange: "2023 – 2026",
    chipNote: "RTX 4060–4070 · RTX 50 series · M2 Pro/Max · RX 7600+",
    ramNote: "16 GB+",
    summary: "Current workstations & gaming PCs. Headroom for fur on, high shell quality, large textures.",
    examples: [
      "RTX 5060 / 5070 / 5080 / 5090 (50 series)",
      "RTX 4060 / 4070 / 4080 desktops",
      "MacBook Pro M2 Pro / M3 / M4 (16 GB+)",
      "Apple Silicon Mac Studio / iMac",
    ],
  },
];

export const ALL_DEVICE_TIERS: DeviceTierProfile[] = [...PORTABLE_TIERS, ...DESKTOP_TIERS];

export function tierProfileById(id: string): DeviceTierProfile | undefined {
  return ALL_DEVICE_TIERS.find((t) => t.id === id);
}

/**
 * Maps a device name from your analytics list to our portable tier (for reference tooling).
 * Names are normalized loosely (generation wording may vary).
 */
export const PORTABLE_DEVICE_TIER_MAP: Record<string, string> = {
  "iPad Air 2": "portable-old",
  "iPad (5th generation)": "portable-old",
  "iPad (6th generation)": "portable-old",
  "iPad Pro (10.5)": "portable-old",
  "iPad Pro (10.5\")": "portable-old",
  "iPad Air (3rd generation)": "portable-old",
  "iPhone XR": "portable-old",

  "iPad Air (4th generation)": "portable-medium",
  "iPad (8th generation)": "portable-medium",
  "iPad (9th generation)": "portable-medium",
  "iPad (10th generation)": "portable-medium",
  "iPhone 12": "portable-medium",
  "iPhone 12 Pro": "portable-medium",
  "iPhone 13": "portable-medium",
  "iPhone 14": "portable-medium",

  "iPad Air (5th generation)": "portable-new",
  "iPad Air (6th generation)": "portable-new",
  "iPad Air (7th generation)": "portable-new",
  "iPad Air 11-inch (M3)": "portable-new",
  "iPad Pro (11)": "portable-new",
  "iPad Pro (11\")(2nd generation)": "portable-new",
  "iPad Pro (12.9\")(3rd generation)": "portable-new",
  "iPad Pro (12.9\")(4th generation)": "portable-new",
  "iPad Pro (12.9\")(5th generation)": "portable-new",
  "iPad (A16)": "portable-new",
  "iPhone 15 Pro": "portable-new",
  "iPhone 17 Pro": "portable-new",
};
