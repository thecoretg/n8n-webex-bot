import {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodeListSearchResult,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';

// Helper: parse the rel="next" URL from a Link response header
function parseNextLink(linkHeader: string | string[] | undefined): string | undefined {
	if (!linkHeader) return undefined;
	const header = Array.isArray(linkHeader) ? linkHeader.join(', ') : linkHeader;
	const match = header.match(/<([^>]+)>;\s*rel="next"/);
	return match ? match[1] : undefined;
}

// Helper: fetch all pages of a Webex list endpoint, up to `limit` items
async function fetchAllPages(
	helpers: IExecuteFunctions['helpers'],
	token: string,
	initialUrl: string,
	limit: number,
): Promise<IDataObject[]> {
	const all: IDataObject[] = [];
	let url: string | undefined = initialUrl;

	while (url && all.length < limit) {
		const response = await helpers.httpRequest({
			method: 'GET',
			url,
			headers: { Authorization: `Bearer ${token}` },
			returnFullResponse: true,
		});

		const body = response.body as { items: IDataObject[] };
		all.push(...body.items);

		url = parseNextLink(
			(response.headers as Record<string, string | string[]>)['link'],
		);
	}

	return limit === Infinity ? all : all.slice(0, limit);
}

export class WebexBot implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Webex Bot',
		name: 'webexBot',
		icon: 'file:webex.svg',
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Send messages and fetch rooms/people via the Cisco Webex Bot API',
		defaults: { name: 'Webex Bot' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'webexBotApi', required: true }],
		properties: [
			// ─── RESOURCE ────────────────────────────────────────────────────────────
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Message', value: 'message' },
					{ name: 'Person', value: 'person' },
					{ name: 'Room', value: 'room' },
				],
				default: 'message',
			},

			// ─── OPERATIONS ──────────────────────────────────────────────────────────
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['message'] } },
				options: [
					{
						name: 'Send',
						value: 'send',
						description: 'Send a message to a room or directly to a person',
						action: 'Send a message',
					},
				],
				default: 'send',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['room'] } },
				options: [
					{
						name: 'List',
						value: 'list',
						description: 'List rooms the bot is a member of',
						action: 'List rooms',
					},
				],
				default: 'list',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['person'] } },
				options: [
					{
						name: 'List',
						value: 'list',
						description: 'Search for people by name or email',
						action: 'List people',
					},
				],
				default: 'list',
			},

			// ─── MESSAGE: SEND ────────────────────────────────────────────────────────
			{
				displayName: 'Destination Type',
				name: 'destinationType',
				type: 'options',
				displayOptions: { show: { resource: ['message'], operation: ['send'] } },
				options: [
					{ name: 'Room', value: 'room' },
					{ name: 'Person', value: 'person' },
				],
				default: 'room',
				description: 'Whether to send to a room/space or directly to a person',
			},
			{
				displayName: 'Room',
				name: 'roomId',
				type: 'resourceLocator',
				default: { mode: 'list', value: '' },
				required: true,
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['send'],
						destinationType: ['room'],
					},
				},
				description: 'The room or space to send the message to',
				modes: [
					{
						displayName: 'From List',
						name: 'list',
						type: 'list',
						placeholder: 'Select a room...',
						typeOptions: {
							searchListMethod: 'searchRooms',
							searchable: true,
						},
					},
					{
						displayName: 'By ID',
						name: 'id',
						type: 'string',
						placeholder: 'Y2lzY29zcGFyazovL...',
						validation: [
							{
								type: 'regex',
								properties: {
									regex: '.+',
									errorMessage: 'Room ID cannot be empty',
								},
							},
						],
					},
				],
			},
			{
				displayName: 'Person',
				name: 'personId',
				type: 'resourceLocator',
				default: { mode: 'list', value: '' },
				required: true,
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['send'],
						destinationType: ['person'],
					},
				},
				description: 'The person to send the direct message to',
				modes: [
					{
						displayName: 'Search by Name',
						name: 'list',
						type: 'list',
						placeholder: 'Type to search...',
						typeOptions: {
							searchListMethod: 'searchPeople',
							searchable: true,
						},
					},
					{
						displayName: 'By ID',
						name: 'id',
						type: 'string',
						placeholder: 'Y2lzY29zcGFyazovL...',
						validation: [
							{
								type: 'regex',
								properties: {
									regex: '.+',
									errorMessage: 'Person ID cannot be empty',
								},
							},
						],
					},
					{
						displayName: 'By Email',
						name: 'email',
						type: 'string',
						placeholder: 'jane@example.com',
						validation: [
							{
								type: 'regex',
								properties: {
									regex: '^[^@]+@[^@]+$',
									errorMessage: 'Must be a valid email address',
								},
							},
						],
					},
				],
			},
			{
				displayName: 'Text',
				name: 'text',
				type: 'string',
				displayOptions: { show: { resource: ['message'], operation: ['send'] } },
				default: '',
				description:
					'Plain-text body of the message. Shown as a fallback when Markdown is also set.',
			},
			{
				displayName: 'Markdown',
				name: 'markdown',
				type: 'string',
				typeOptions: { rows: 4 },
				displayOptions: { show: { resource: ['message'], operation: ['send'] } },
				default: '',
				description:
					'Markdown-formatted body. When provided, Webex uses this and treats Text as the fallback for clients that do not support Markdown.',
			},

			// ─── ROOM: LIST ───────────────────────────────────────────────────────────
			{
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				displayOptions: { show: { resource: ['room'], operation: ['list'] } },
				default: false,
				description: 'Whether to return all results or only up to a given limit',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 1000 },
				displayOptions: {
					show: { resource: ['room'], operation: ['list'], returnAll: [false] },
				},
				default: 50,
				description: 'Maximum number of rooms to return',
			},
			{
				displayName: 'Filters',
				name: 'roomFilters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				displayOptions: { show: { resource: ['room'], operation: ['list'] } },
				options: [
					{
						displayName: 'Type',
						name: 'type',
						type: 'options',
						options: [
							{ name: 'All', value: '' },
							{ name: 'Direct (1:1)', value: 'direct' },
							{ name: 'Group', value: 'group' },
						],
						default: '',
						description: 'Filter rooms by type',
					},
				],
			},

			// ─── PERSON: LIST ─────────────────────────────────────────────────────────
			{
				displayName: 'Search By',
				name: 'searchBy',
				type: 'options',
				displayOptions: { show: { resource: ['person'], operation: ['list'] } },
				options: [
					{ name: 'Display Name', value: 'displayName' },
					{ name: 'Email', value: 'email' },
				],
				default: 'displayName',
				description: 'Field to search people by',
			},
			{
				displayName: 'Search Value',
				name: 'searchValue',
				type: 'string',
				displayOptions: { show: { resource: ['person'], operation: ['list'] } },
				default: '',
				required: true,
				description:
					'Value to search for. Display name uses prefix matching; email requires an exact match.',
			},
			{
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				displayOptions: { show: { resource: ['person'], operation: ['list'] } },
				default: false,
				description: 'Whether to return all results or only up to a given limit',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 1000 },
				displayOptions: {
					show: { resource: ['person'], operation: ['list'], returnAll: [false] },
				},
				default: 50,
				description: 'Maximum number of people to return',
			},
		],
	};

	// ─── DYNAMIC DROPDOWN METHODS ───────────────────────────────────────────────
	methods = {
		listSearch: {
			/**
			 * Fetches rooms the bot is in, filtered client-side by the user's search term.
			 * The Webex Rooms API has no server-side title filter, so we page through
			 * results and match locally.
			 */
			async searchRooms(
				this: ILoadOptionsFunctions,
				filter?: string,
			): Promise<INodeListSearchResult> {
				const credentials = await this.getCredentials('webexBotApi');
				const token = credentials.accessToken as string;

				const results: Array<{ name: string; value: string }> = [];
				let url: string | undefined = 'https://webexapis.com/v1/rooms?max=1000';

				while (url) {
					const response = await this.helpers.httpRequest({
						method: 'GET',
						url,
						headers: { Authorization: `Bearer ${token}` },
						returnFullResponse: true,
					});

					const body = response.body as { items: Array<{ id: string; title: string; type: string }> };
					for (const room of body.items) {
						const title = room.title || '(no title)';
						const typeLabel = room.type === 'direct' ? ' [Direct]' : ' [Group]';
						const label = title + typeLabel;
						if (!filter || title.toLowerCase().includes(filter.toLowerCase())) {
							results.push({ name: label, value: room.id });
						}
					}

					url = parseNextLink(
						(response.headers as Record<string, string | string[]>)['link'],
					);
				}

				return { results };
			},

			/**
			 * Searches people by display name using the Webex People API.
			 * Requires at least one character to search — returns empty when blank.
			 */
			async searchPeople(
				this: ILoadOptionsFunctions,
				filter?: string,
			): Promise<INodeListSearchResult> {
				if (!filter?.trim()) {
					return { results: [] };
				}

				const credentials = await this.getCredentials('webexBotApi');
				const token = credentials.accessToken as string;

				const qs = new URLSearchParams({ displayName: filter.trim(), max: '50' });
				const response = await this.helpers.httpRequest({
					method: 'GET',
					url: `https://webexapis.com/v1/people?${qs}`,
					headers: { Authorization: `Bearer ${token}` },
				});

				const people = (response as { items: Array<{ id: string; displayName: string; emails: string[] }> }).items;

				return {
					results: people.map((p) => ({
						name: `${p.displayName} (${p.emails?.[0] ?? 'no email'})`,
						value: p.id,
					})),
				};
			},
		},
	};

	// ─── EXECUTE ─────────────────────────────────────────────────────────────────
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		const credentials = await this.getCredentials('webexBotApi');
		const token = credentials.accessToken as string;

		for (let i = 0; i < items.length; i++) {
			try {
				// ── Message: Send ────────────────────────────────────────────────────
				if (resource === 'message' && operation === 'send') {
					const destinationType = this.getNodeParameter('destinationType', i) as string;
					const text = this.getNodeParameter('text', i) as string;
					const markdown = this.getNodeParameter('markdown', i) as string;

					if (!text.trim() && !markdown.trim()) {
						throw new NodeOperationError(
							this.getNode(),
							'At least one of Text or Markdown must be provided.',
							{ itemIndex: i },
						);
					}

					const body: IDataObject = {};
					if (text.trim()) body.text = text;
					if (markdown.trim()) body.markdown = markdown;

					if (destinationType === 'room') {
						const locator = this.getNodeParameter('roomId', i) as {
							mode: string;
							value: string;
						};
						body.roomId = locator.value;
					} else {
						const locator = this.getNodeParameter('personId', i) as {
							mode: string;
							value: string;
						};
						if (locator.mode === 'email') {
							body.toPersonEmail = locator.value;
						} else {
							body.toPersonId = locator.value;
						}
					}

					const response = await this.helpers.httpRequest({
						method: 'POST',
						url: 'https://webexapis.com/v1/messages',
						headers: {
							Authorization: `Bearer ${token}`,
							'Content-Type': 'application/json',
						},
						body,
						json: true,
					});

					returnData.push({ json: response as IDataObject, pairedItem: i });

				// ── Room: List ───────────────────────────────────────────────────────
				} else if (resource === 'room' && operation === 'list') {
					const returnAll = this.getNodeParameter('returnAll', i) as boolean;
					const limit = returnAll ? Infinity : (this.getNodeParameter('limit', i) as number);
					const filters = this.getNodeParameter('roomFilters', i) as { type?: string };

					const qs = new URLSearchParams({ max: '200' });
					if (filters.type) qs.set('type', filters.type);

					const rooms = await fetchAllPages(
						this.helpers,
						token,
						`https://webexapis.com/v1/rooms?${qs}`,
						limit,
					);

					returnData.push(...rooms.map((r) => ({ json: r, pairedItem: i })));

				// ── Person: List ─────────────────────────────────────────────────────
				} else if (resource === 'person' && operation === 'list') {
					const searchBy = this.getNodeParameter('searchBy', i) as string;
					const searchValue = this.getNodeParameter('searchValue', i) as string;
					const returnAll = this.getNodeParameter('returnAll', i) as boolean;
					const limit = returnAll ? Infinity : (this.getNodeParameter('limit', i) as number);

					const qs = new URLSearchParams({ [searchBy]: searchValue, max: '200' });

					const people = await fetchAllPages(
						this.helpers,
						token,
						`https://webexapis.com/v1/people?${qs}`,
						limit,
					);

					returnData.push(...people.map((p) => ({ json: p, pairedItem: i })));
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: i,
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
