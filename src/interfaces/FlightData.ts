export interface FlightAirport {
	name: string;
	iata: string;
	timeZone?: string;
}

export interface FlightEndpoint {
	airport: FlightAirport;
	scheduledTime?: string;
	actualTime?: string;
	estimatedTime?: string;
	scheduledTimeUtc?: string;
	actualTimeUtc?: string;
	estimatedTimeUtc?: string;
	terminal?: string;
	gate?: string;
	baggage?: string;
	delay?: number;
}

export interface FlightData {
	airline: { name: string; iata: string };
	flightNumber: string;
	status: string;
	departure: FlightEndpoint;
	arrival: FlightEndpoint;
	aircraft?: { model: string; registration: string };
	greatCircleDistance?: { km: number };
}
