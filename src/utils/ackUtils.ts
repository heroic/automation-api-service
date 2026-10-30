import { RequestProperties } from "../types/cache-types";
import logger from "@ondc/automation-logger";

type AckResponse = {
	context?: any;
	message: {
		ack: {
			status: "ACK" | "NACK";
		};
	};
	error?: any;
};

export const setAckResponse = (
	ack: boolean = true,
	body: any,
	error?: string,
	errorCode?: string,
	requestProperties?: RequestProperties
): AckResponse => {
	const resp: AckResponse = {
		message: {
			ack: {
				status: ack ? "ACK" : "NACK",
			},
		},
	};

	if (error && errorCode) {
		const hint = getHintMessage(requestProperties);
		if (hint) {
			error += ` \n >> ${hint}`;
		}
		resp.error = {
			code: errorCode,
			message: error,
		};
	}

	if (shouldAddContext()) {
		resp.context = body.context ?? {};
	}

	if (resp.error) {
		const { error: err, message, ...rest } = resp;
		return {
			error: err,
			message,
			...rest,
		} as AckResponse;
	}

	return resp;
};
export const setInternalServerNack = {
	message: {
		ack: {
			status: "NACK",
		},
	},
	error: {
		code: "23001",
		message: "Internal Server Error",
	},
};

export const setBadRequestNack = (message = "") => {
	const resp: any = {
		message: {
			ack: {
				status: "NACK",
			},
		},
		error: {
			code: "10000",
			message: "Bad Request " + message,
		},
	};
	if (shouldAddContext()) {
		resp.context = {};
	}
	return resp;
};

export function shouldAddContext() {
	const version = process.env.VERSION;
	if (!version) {
		return false;
	}
	// Logistics 1.2.0 ACK/NACK schemas allow message/error only.
	if (process.env.DOMAIN === "nic2004:60232" && version === "1.2.0") {
		return false;
	}
	const major = parseInt(version.split(".")[0]);
	logger.info(
		`Version: ${version}, Major Value: ${major},thus context in ack is : ${major > 1}`
	);
	return major < 2;
}

export function getHintMessage(properties?: RequestProperties) {
	if (
		!properties ||
		!properties.transactionHistory ||
		!properties.sessionData
	) {
		return "";
	}
	const history = properties.transactionHistory;
	const nackCount = history.apiList.filter(
		(s) => s.entryType === "API" && s.response?.message?.ack?.status !== "ACK"
	).length;
	let message = "Hints: \n";
	if (nackCount >= 1) {
		message += `- If you are trying to run a new flow, please give new transaction ID as ${properties.transactionId} has been already used. \n`;
	}
}
