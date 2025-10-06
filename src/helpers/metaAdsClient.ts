const GRAPH_HOST = "https://graph.facebook.com";
const DEFAULT_API_VERSION = "v19.0";

export type MetaAdsConfig = {
        accessToken: string;
        defaultAdAccountId?: string;
        businessId?: string;
        apiVersion?: string;
};

export type MetaAdsTimeRange = {
        since: string;
        until: string;
};

export class MetaAdsError extends Error {
        status: number;
        code?: string;
        fbtraceId?: string;

        constructor(message: string, options: { status: number; code?: string; fbtraceId?: string }) {
                super(message);
                this.name = "MetaAdsError";
                this.status = options.status;
                this.code = options.code;
                this.fbtraceId = options.fbtraceId;
        }
}

export class MetaAdsClient {
        private readonly accessToken: string;
        private readonly apiVersion: string;
        readonly defaultAdAccountId?: string;
        readonly businessId?: string;

        constructor(config: MetaAdsConfig) {
                if (!config.accessToken) {
                        throw new Error("A Meta Ads access token is required");
                }

                this.accessToken = config.accessToken;
                this.apiVersion = config.apiVersion || DEFAULT_API_VERSION;
                this.defaultAdAccountId = config.defaultAdAccountId;
                this.businessId = config.businessId;
        }

        ensureAccountPrefix(adAccountId: string): string {
                if (!adAccountId) {
                        throw new Error("An ad account ID must be provided");
                }

                return adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
        }

        async getAdAccount(adAccountId: string, params: Record<string, string | undefined>) {
                const account = this.ensureAccountPrefix(adAccountId);
                return this.request(account, params);
        }

        async getInsights(adAccountId: string, params: Record<string, string | undefined>) {
                const account = this.ensureAccountPrefix(adAccountId);
                return this.request(`${account}/insights`, params);
        }

        async getAsyncReport(jobId: string) {
                if (!jobId) {
                        throw new Error("A report run ID must be provided");
                }

                return this.request(jobId, {});
        }

        private async request(path: string, params: Record<string, string | undefined>) {
                const url = new URL(`${GRAPH_HOST}/${this.apiVersion}/${path}`);
                const searchParams = new URLSearchParams();

                searchParams.set("access_token", this.accessToken);

                for (const [key, value] of Object.entries(params)) {
                        if (value === undefined || value === null) {
                                continue;
                        }

                        searchParams.set(key, value);
                }

                url.search = searchParams.toString();

                const response = await fetch(url.toString(), {
                        method: "GET",
                        headers: { "Content-Type": "application/json" },
                });

                let payload: any = null;

                try {
                        payload = await response.json();
                } catch (error) {
                        throw new MetaAdsError("Meta Ads API returned a non-JSON response", {
                                status: response.status,
                        });
                }

                if (!response.ok || payload?.error) {
                        const error = payload?.error;

                        throw new MetaAdsError(error?.message || "Meta Ads API request failed", {
                                status: response.status,
                                code: error?.code,
                                fbtraceId: error?.fbtrace_id,
                        });
                }

                return payload;
        }
}

export function createMetaAdsClient(config: MetaAdsConfig) {
        return new MetaAdsClient(config);
}
