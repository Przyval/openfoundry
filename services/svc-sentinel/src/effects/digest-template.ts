/**
 * Digest Template — builds HTML email with weekly KPIs from Kelava data.
 *
 * Queries svc-objects for aggregated metrics and formats as
 * a styled HTML email (inline CSS for email client compatibility).
 */

interface DigestData {
  totalCustomers: number;
  totalRoadPlans: number;
  totalVisits: number;
  avgCompletionRate: number;
  criticalFlags: number;
  topTechnicians: Array<{ name: string; completed: number; grade: string }>;
}

async function fetchDigestData(objectsBaseUrl: string): Promise<DigestData> {
  const data: DigestData = {
    totalCustomers: 0,
    totalRoadPlans: 0,
    totalVisits: 0,
    avgCompletionRate: 0,
    criticalFlags: 0,
    topTechnicians: [],
  };

  // Find sanocare-kelava ontology
  try {
    const ontRes = await fetch(`${objectsBaseUrl}/api/v2/ontologies`);
    if (!ontRes.ok) return data;
    const ontData = (await ontRes.json()) as { data: Array<{ rid: string; apiName: string }> };
    const ont = ontData.data.find((o) => o.apiName === "sanocare-kelava");
    if (!ont) return data;
    const rid = ont.rid;

    // Parallel count queries
    const countType = async (objectType: string): Promise<number> => {
      const res = await fetch(`${objectsBaseUrl}/api/v2/ontologies/${rid}/objectSets/aggregate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objectSet: { type: "base", objectType },
          aggregation: [{ type: "count" }],
        }),
      });
      if (!res.ok) return 0;
      const d = (await res.json()) as { data: Array<{ value?: number; metrics?: { count: number } }> };
      return d.data?.[0]?.value ?? d.data?.[0]?.metrics?.count ?? 0;
    };

    const [customers, roadPlans, visits, flags] = await Promise.all([
      countType("KelavaCustomer"),
      countType("KelavaRoadPlan"),
      countType("KelavaVisit"),
      countType("KelavaFlag"),
    ]);

    data.totalCustomers = customers;
    data.totalRoadPlans = roadPlans;
    data.totalVisits = visits;
    data.criticalFlags = flags;

    // Fetch KPIs for top technicians
    const kpiRes = await fetch(`${objectsBaseUrl}/api/v2/ontologies/${rid}/objectSets/loadObjects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        objectSet: { type: "base", objectType: "KelavaKPI" },
        pageSize: 100,
      }),
    });
    if (kpiRes.ok) {
      const kpiData = (await kpiRes.json()) as {
        data: Array<{ properties: { technicianId?: string; totalCompleted?: number; completionRate?: number; grade?: string } }>;
      };
      const kpis = kpiData.data ?? [];
      const rates = kpis.map((k) => k.properties.completionRate ?? 0);
      data.avgCompletionRate = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;

      // Top 5 by completed
      const sorted = [...kpis].sort(
        (a, b) => (b.properties.totalCompleted ?? 0) - (a.properties.totalCompleted ?? 0),
      );
      data.topTechnicians = sorted.slice(0, 5).map((k) => ({
        name: k.properties.technicianId ?? "Unknown",
        completed: k.properties.totalCompleted ?? 0,
        grade: k.properties.grade ?? "—",
      }));
    }
  } catch {
    // Return partial data on error
  }

  return data;
}

export async function buildDigestHtml(objectsBaseUrl: string): Promise<string> {
  const d = await fetchDigestData(objectsBaseUrl);

  const techRows = d.topTechnicians
    .map(
      (t) => `
      <tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${t.name}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #eee; text-align: right;">${t.completed}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #eee; text-align: center;">
          <span style="background: ${t.grade === "A" ? "#0F9960" : t.grade === "B" ? "#2965CC" : "#D9822B"}; color: #fff; padding: 2px 8px; border-radius: 12px; font-weight: bold;">${t.grade}</span>
        </td>
      </tr>`,
    )
    .join("");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">

    <!-- Header -->
    <div style="background: linear-gradient(135deg, #2965CC, #0F9960); padding: 24px; color: #fff;">
      <h1 style="margin: 0; font-size: 22px;">Sanocare Weekly Digest</h1>
      <p style="margin: 4px 0 0; opacity: 0.9; font-size: 14px;">Powered by OpenFoundry</p>
    </div>

    <!-- KPI Cards -->
    <div style="padding: 20px; display: flex; gap: 12px;">
      <div style="flex: 1; background: #F5F8FA; border-radius: 6px; padding: 12px; text-align: center;">
        <div style="font-size: 28px; font-weight: 700; color: #2965CC;">${d.totalCustomers.toLocaleString()}</div>
        <div style="font-size: 11px; color: #8A9BA8; margin-top: 2px;">Customers</div>
      </div>
      <div style="flex: 1; background: #F5F8FA; border-radius: 6px; padding: 12px; text-align: center;">
        <div style="font-size: 28px; font-weight: 700; color: #0F9960;">${d.totalRoadPlans.toLocaleString()}</div>
        <div style="font-size: 11px; color: #8A9BA8; margin-top: 2px;">Road Plans</div>
      </div>
      <div style="flex: 1; background: #F5F8FA; border-radius: 6px; padding: 12px; text-align: center;">
        <div style="font-size: 28px; font-weight: 700; color: #D9822B;">${d.totalVisits.toLocaleString()}</div>
        <div style="font-size: 11px; color: #8A9BA8; margin-top: 2px;">Visits</div>
      </div>
      <div style="flex: 1; background: #F5F8FA; border-radius: 6px; padding: 12px; text-align: center;">
        <div style="font-size: 28px; font-weight: 700; color: #0F9960;">${d.avgCompletionRate.toFixed(1)}%</div>
        <div style="font-size: 11px; color: #8A9BA8; margin-top: 2px;">Completion</div>
      </div>
    </div>

    <!-- Top Technicians -->
    <div style="padding: 0 20px 20px;">
      <h3 style="margin: 0 0 12px; font-size: 16px; color: #333;">Top Technicians</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <thead>
          <tr style="background: #F5F8FA;">
            <th style="padding: 8px 12px; text-align: left; font-weight: 600;">Technician</th>
            <th style="padding: 8px 12px; text-align: right; font-weight: 600;">Completed</th>
            <th style="padding: 8px 12px; text-align: center; font-weight: 600;">Grade</th>
          </tr>
        </thead>
        <tbody>
          ${techRows || '<tr><td colspan="3" style="padding: 12px; text-align: center; color: #999;">No KPI data available</td></tr>'}
        </tbody>
      </table>
    </div>

    ${d.criticalFlags > 0 ? `
    <!-- Flags Warning -->
    <div style="padding: 0 20px 20px;">
      <div style="background: #FFF3E0; border-left: 4px solid #D9822B; padding: 12px 16px; border-radius: 4px;">
        <strong style="color: #D9822B;">${d.criticalFlags} verification flags</strong>
        <span style="color: #666;"> need attention. Review in the dashboard.</span>
      </div>
    </div>
    ` : ""}

    <!-- Footer -->
    <div style="padding: 16px 20px; background: #F5F8FA; text-align: center; font-size: 12px; color: #999;">
      OpenFoundry — Palantir-class intelligence for your business
    </div>
  </div>
</body>
</html>`;
}
