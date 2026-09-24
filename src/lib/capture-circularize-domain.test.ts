import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MCP_TOOL_DEFS } from "../../mcp/full-catalog";
import { captureCircularizeDv } from "./physics/discovery-wave";

const captureTool = MCP_TOOL_DEFS.find(
  (tool) => tool.name === "capture_circularize",
);
if (!captureTool) throw new Error("capture_circularize MCP tool is missing");

const schema = z.object(captureTool.inputSchema);
const valid = { rp_m: 6_578_137, v_inf_m_s: 1_000 };

describe("capture-circularize finite domain", () => {
  it("keeps the finite two-body capture result unchanged", () => {
    expect(schema.safeParse(valid).success).toBe(true);
    expect(
      captureCircularizeDv(3.986004418e14, valid.rp_m, valid.v_inf_m_s),
    ).toBeCloseTo(3269.672480493, 6);
  });

  it("rejects non-finite helper inputs rather than returning a plausible finite delta-v", () => {
    expect(
      captureCircularizeDv(3.986004418e14, Number.POSITIVE_INFINITY, 2_000),
    ).toBeNull();
    expect(
      captureCircularizeDv(Number.POSITIVE_INFINITY, 6_578_137, 2_000),
    ).toBeNull();
    expect(
      captureCircularizeDv(3.986004418e14, 6_578_137, Number.POSITIVE_INFINITY),
    ).toBeNull();
    expect(captureCircularizeDv(3.986004418e14, Number.NaN, 2_000)).toBeNull();
  });

  it("rejects non-finite MCP fields and fails closed in direct handler calls", () => {
    for (const value of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      expect(schema.safeParse({ ...valid, rp_m: value }).success).toBe(false);
      expect(schema.safeParse({ ...valid, v_inf_m_s: value }).success).toBe(
        false,
      );
      expect(schema.safeParse({ ...valid, mu: value }).success).toBe(false);
    }

    expect(
      captureTool.run({ ...valid, rp_m: Number.POSITIVE_INFINITY }),
    ).toBeNull();
    expect(
      captureTool.run({ ...valid, mu: Number.NEGATIVE_INFINITY }),
    ).toBeNull();
  });
});
