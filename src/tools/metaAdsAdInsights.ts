import { z } from "zod";
import { experimental_PaidMcpAgent as PaidMcpAgent } from "@stripe/agent-toolkit/cloudflare";
import { createMetaAdsClient } from "../helpers/metaAdsClient";
import { METERED_TOOL_PAYMENT_REASON } from "../helpers/constants";

const DEFAULT_FIELDS = [
        "ad_id",
        "ad_name",
        "adset_name",
        "campaign_name",
        "spend",
        "impressions",
        "reach",
        "clicks",
        "inline_link_clicks",
        "actions",
];

const timeRangeSchema = z
        .object({
                since: z.string().min(1),
                until: z.string().min(1),
        })
        .optional();

const filteringSchema = z
        .array(
                z.object({
                        field: z.string(),
                        operator: z.string(),
                        value: z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))]),
                })
        )
        .optional();

const requestSchema = z.object({
        adAccountId: z.string().optional(),
        fields: z.array(z.string()).optional(),
        breakdowns: z.array(z.string()).optional(),
        datePreset: z.string().optional(),
        timeRange: timeRangeSchema,
        timeIncrement: z.union([z.string(), z.number()]).optional(),
        filtering: filteringSchema,
});

type RequestInput = z.infer<typeof requestSchema>;

type ToolConfig = {
        META_ADS_SYSTEM_USER_TOKEN: string;
        META_ADS_API_VERSION?: string;
        META_ADS_DEFAULT_ACCOUNT_ID?: string;
        META_ADS_BUSINESS_ID?: string;
        STRIPE_METERED_PRICE_ID: string;
        BASE_URL: string;
};

export function metaAdsAdInsightsTool(agent: PaidMcpAgent<Env, any, any>, config: ToolConfig) {
        const {
                META_ADS_SYSTEM_USER_TOKEN,
                META_ADS_API_VERSION,
                META_ADS_DEFAULT_ACCOUNT_ID,
                META_ADS_BUSINESS_ID,
                STRIPE_METERED_PRICE_ID,
                BASE_URL,
        } = config;

        const client = createMetaAdsClient({
                accessToken: META_ADS_SYSTEM_USER_TOKEN,
                apiVersion: META_ADS_API_VERSION,
                defaultAdAccountId: META_ADS_DEFAULT_ACCOUNT_ID,
                businessId: META_ADS_BUSINESS_ID,
        });

        agent.paidTool(
                "meta_ads_ad_insights",
                "Retrieve ad-level performance metrics from Meta Ads with metered billing.",
                requestSchema,
                async (input: RequestInput) => {
                        const adAccountId = input.adAccountId || client.defaultAdAccountId;

                        if (!adAccountId) {
                                throw new Error(
                                        "No ad account ID was provided. Pass `adAccountId` in the request or configure META_ADS_DEFAULT_ACCOUNT_ID."
                                );
                        }

                        const fields = input.fields?.length ? input.fields : DEFAULT_FIELDS;

                        const params: Record<string, string | undefined> = {
                                fields: fields.join(","),
                                level: "ad",
                                time_increment: input.timeIncrement ? String(input.timeIncrement) : "1",
                        };

                        if (input.breakdowns?.length) {
                                params.breakdowns = input.breakdowns.join(",");
                        }

                        if (input.filtering?.length) {
                                params.filtering = JSON.stringify(input.filtering);
                        }

                        if (input.datePreset) {
                                params.date_preset = input.datePreset;
                        } else if (input.timeRange) {
                                params.time_range = JSON.stringify(input.timeRange);
                        } else {
                                params.date_preset = "last_30d";
                        }

                        const insights = await client.getInsights(adAccountId, params);

                        const payload = {
                                request: {
                                        adAccountId: client.ensureAccountPrefix(adAccountId),
                                        fields,
                                        breakdowns: input.breakdowns,
                                        datePreset: params.date_preset,
                                        timeRange: input.timeRange,
                                        timeIncrement: params.time_increment,
                                        filtering: input.filtering,
                                },
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
                },
                {
                        checkout: {
                                success_url: `${BASE_URL}/payment/success`,
                                line_items: [
                                        {
                                                price: STRIPE_METERED_PRICE_ID,
                                        },
                                ],
                                mode: "subscription",
                        },
                        meterEvent: "meta_ads_ad_insights_usage",
                        paymentReason:
                                "METER INFO: Each ad-level query is billed after the first 5 free requests. " +
                                METERED_TOOL_PAYMENT_REASON,
                }
        );
}
