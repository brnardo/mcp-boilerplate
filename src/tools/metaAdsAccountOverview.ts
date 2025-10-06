import { z } from "zod";
import { experimental_PaidMcpAgent as PaidMcpAgent } from "@stripe/agent-toolkit/cloudflare";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMetaAdsClient } from "../helpers/metaAdsClient";

const DEFAULT_ACCOUNT_FIELDS = [
        "id",
        "name",
        "currency",
        "account_status",
        "balance",
        "spend_cap",
        "amount_spent",
];

const DEFAULT_OVERVIEW_FIELDS = [
        "spend",
        "impressions",
        "reach",
        "clicks",
        "inline_link_clicks",
        "actions",
];

const timeRangeSchema = z
        .object({
                since: z.string().min(1, "Provide a starting date in YYYY-MM-DD format."),
                until: z.string().min(1, "Provide an ending date in YYYY-MM-DD format."),
        })
        .optional();

const requestSchema = z.object({
        adAccountId: z.string().optional(),
        datePreset: z.string().optional(),
        timeRange: timeRangeSchema,
        fields: z.array(z.string()).optional(),
        accountFields: z.array(z.string()).optional(),
});

type RequestInput = z.infer<typeof requestSchema>;

type MetaConfig = {
        META_ADS_SYSTEM_USER_TOKEN: string;
        META_ADS_API_VERSION?: string;
        META_ADS_DEFAULT_ACCOUNT_ID?: string;
        META_ADS_BUSINESS_ID?: string;
};

export function metaAdsAccountOverviewTool(
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
                "meta_ads_account_overview",
                "Summarize high-level Meta Ads account performance for the configured business.",
                requestSchema,
                async (input: RequestInput) => {
                        const adAccountId = input.adAccountId || client.defaultAdAccountId;

                        if (!adAccountId) {
                                throw new Error(
                                        "No ad account ID was provided. Pass `adAccountId` in the request or configure META_ADS_DEFAULT_ACCOUNT_ID."
                                );
                        }

                        const accountFields = input.accountFields?.length ? input.accountFields : DEFAULT_ACCOUNT_FIELDS;
                        const overviewFields = input.fields?.length ? input.fields : DEFAULT_OVERVIEW_FIELDS;

                        const params: Record<string, string | undefined> = {
                                fields: overviewFields.join(","),
                                level: "account",
                                time_increment: "1",
                                limit: "1",
                        };

                        if (input.datePreset) {
                                params.date_preset = input.datePreset;
                        } else if (input.timeRange) {
                                params.time_range = JSON.stringify(input.timeRange);
                        } else {
                                params.date_preset = "last_7d";
                        }

                        const [account, insights] = await Promise.all([
                                client.getAdAccount(adAccountId, {
                                        fields: accountFields.join(","),
                                }),
                                client.getInsights(adAccountId, params),
                        ]);

                        const payload = {
                                request: {
                                        adAccountId: client.ensureAccountPrefix(adAccountId),
                                        fields: overviewFields,
                                        accountFields,
                                        datePreset: params.date_preset,
                                        timeRange: input.timeRange,
                                },
                                account,
                                insights,
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
