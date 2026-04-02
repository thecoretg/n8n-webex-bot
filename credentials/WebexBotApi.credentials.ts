import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class WebexBotApi implements ICredentialType {
	name = 'webexBotApi';
	displayName = 'Webex Bot API';
	documentationUrl = 'https://developer.webex.com/docs/bots';
	properties: INodeProperties[] = [
		{
			displayName: 'Bot Access Token',
			name: 'accessToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			placeholder: 'OWQwMzA4...',
			description:
				'The permanent access token for your Webex Bot. Found in the Webex Developer Portal under My Apps.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.accessToken}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://webexapis.com/v1',
			url: '/people/me',
		},
	};
}
