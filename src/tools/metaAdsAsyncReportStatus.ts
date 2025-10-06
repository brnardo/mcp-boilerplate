import { z } from "zod";
import { experimental_PaidMcpAgent as PaidMcpAgent } from "@stripe/agent-toolkit/cloudflare";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMetaAdsClient } from "../helpers/metaAdsClient";

const requestSchema = z.object({
        reportRunId: z.string().min(1, "Provide the ID returned by an async insights export."),
});

type RequestInput = z.infer<typeof requestSchema>;

type MetaConfig = {
        META_ADS_SYSTEM_USER_TOKEN: string;
        META_ADS_API_VERSION?: string;
        META_ADS_DEFAULT_ACCOUNT_ID?: string;
        META_ADS_BUSINESS_ID?: string;
};

export function metaAdsAsyncReportStatusTool(
        agent: PaidMcpAgent<Env, any, any>,
        config: MetaConfig
) {
        const { META_ADS_SYSTEM_USER_TOKEN, META_ADS_API_VERSION, META_ADS_DEFAULT_ACCOUNT_ID, META_ADS_BUSINESS_ID } = config;

        const client = createMetaAdsClient({
                accessToken: META_ADS_SYSTEM_USER_TOKEN,
                apiVersion: META_ADS_API_VERSION,
                defaultAdAccountId: META_ADS_DEFAULT_ACCOUNT_ID,
                businessId: META_ADS_BUSINESS_ID,
        });

        (agent.server as McpServer).tool(
                "meta_ads_async_report_status",
                "Look up the status of an async Meta Ads insights export.",
                requestSchema,
                async (input: RequestInput) => {
                        const report = await client.getAsyncReport(input.reportRunId);

                        const payload = {
                                request: input,
                                report,
                        };

                        return {
                                content: [
                                        {
                                                type: "text",
                                                text: JSON.stringify(payload, null, 2),
                                        },
                                ],
                        };
                }
        );
}
