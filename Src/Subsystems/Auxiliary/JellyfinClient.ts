// -- Jellyfin Client --

//Imports

//Exports
import { Api, Jellyfin } from "@jellyfin/sdk";
import SysUtils from "../Utilities/SysUtils.js";
import { BaseItemKind, SearchHint, SystemApi } from "@jellyfin/sdk/lib/generated-client";
import { JClientStatus } from "./JClientStatus.js";
import { getSearchApi } from "@jellyfin/sdk/lib/utils/api/search-api.js";
import { getLibraryApi } from "@jellyfin/sdk/lib/utils/api/library-api.js";
import { getSystemApi } from "@jellyfin/sdk/lib/utils/api/system-api.js";

const version = process.env.VERSION as string;

const jAddr = process.env.JELLYFIN_ADDRESS as string;
const jUser = process.env.JELLYFIN_USER as string;
const jPass = process.env.JELLYFIN_PASS as string;

export class JellyfinClient {
    private jClient!: Jellyfin;
    private jClientAPI!: Api;
    private jSysAPI!: SystemApi;
    private jUID!: string;
    private readonly playState: JClientStatus;

    constructor() {
        this.playState = {
            AUTH: false,
            CONNECTED: false,
            SESSION_DATA: undefined,
            SYS_INFO: undefined,
            LIBRARY_API: undefined,
            LIBRARIES: undefined,
            UID: undefined
        };

        this.init();
    }

    init() {
        this.jClient = this.buildClient()
        this.jClientAPI = this.connectAPI(this.jClient);

        SysUtils.log('info', '[JCLIENT] Service built.');
    }

    buildClient(): Jellyfin {
        return new Jellyfin({
            clientInfo: {
                name: "LCARS47 JClient",
                version: version
            },
            deviceInfo: {
                id: "LCARS47-Jellyfin-Service",
                name: "LCARS47 Jellyfin Service"
            }
        });
    }

    connectAPI(jClient: Jellyfin): Api {
        this.playState.CONNECTED = true;
        return jClient.createApi(jAddr);
    }

    auth() {
        this.jClientAPI
            .authenticateUserByName(
                jUser, jPass
            )
            .then(async (res) => {
                const sData = res.data.SessionInfo;
                if (!sData) return SysUtils.log('err', '[JCLIENT] Failed to authenticate the API (No session).');
                if (!sData.UserId) return SysUtils.log('err', '[JCLIENT] Failed to authenticate the API (No user).');

                this.jUID = sData.UserId;
                SysUtils.log('proc', `[JCLIENT] ${this.jUID} user connected to service.`);

                this.jSysAPI = getSystemApi(this.jClientAPI);
                this.playState.AUTH = true;
                this.playState.SESSION_DATA = sData;
                this.playState.UID = sData.UserId;
            })
            .catch((err) => {
                this.playState.CONNECTED = false;
                SysUtils.log('err', '[JCLIENT] Auth Error\n' + err);
            })
            .finally(() => {
                this.populateClientStatus();
            });
    }

    async populateClientStatus() {
        //Generate Public System Info
        await this.jSysAPI.getPublicSystemInfo()
            .then((res) => {
                this.playState.SYS_INFO = res.data;
            })
            .catch((err) => {
                SysUtils.log('err', '[JCLIENT] Failed to get public system info.\n' + err);
            });

        //Obtain Library API
        this.playState.LIBRARY_API = await getLibraryApi(this.jClientAPI);

        //Get Media Libraries
        await this.playState.LIBRARY_API.getMediaFolders()
            .then((res) => {
                this.playState.LIBRARIES = res.data;
            })
            .catch((err) => {
                SysUtils.log('err', '[JCLIENT] Failed to get Media Libraries.');
            });
    }

    destroy() {
        if (!this.jClientAPI) return SysUtils.log('warn', '[JCLIENT] API was in unknown state, unsafe exit occurred.');

        this.jClientAPI.logout();
        this.playState.AUTH = false;
        this.playState.CONNECTED = false;
    }

    async searchType(
        query: string,
        types: BaseItemKind[]
    ): Promise<SearchHint | undefined> {
        const searchAPI = getSearchApi(this.jClientAPI);

        if (types.length === 0) {
            SysUtils.log('warn', '[JCLIENT] Search types was somehow empty.');
        }

        try {
            const { data, status } = await searchAPI.get({
                searchTerm: query,
                includeItemTypes: types,
                limit: 1
            });

            if (status !== 200) {
                this.playState.CONNECTED = false;
                SysUtils.log('err', '[JCLIENT] Failed to connect to the API!');
                return undefined;
            }

            if (!data) throw 'No data!';
            const { SearchHints } = data;
            if (!SearchHints || data.TotalRecordCount === 0) return undefined;

            return SearchHints[0];
        }
        catch (err) {
            SysUtils.log('err', '[JCLIENT] Failed to index any search hits.\n' + err);
            return undefined;
        }
    }

    getAPI() {
        return this.jClientAPI;
    }

    getJClient() {
        return this.jClient;
    }

    getJSysAPI() {
        return this.jSysAPI;
    }

    getStatus() {
        return this.playState;
    }
}