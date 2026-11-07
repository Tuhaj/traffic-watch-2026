/** Machine-readable API error codes; the UI translates them, `message` is an English fallback for other clients. */
export type ErrorCode =
  | "bad_request"
  | "not_found"
  | "method_not_allowed"
  | "internal"
  | "outside_radius"
  | "too_close"
  | "route_failed"
  | "transit_failed"
  | "bike_failed"
  | "quota_user"
  | "quota_global"
  | "query_too_long"
  | "bad_place_id"
  | "place_not_found"
  | "place_outside";

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  params?: Record<string, string | number>;
}

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  bad_request: "Bad request",
  not_found: "Not found",
  method_not_allowed: "Method not allowed",
  internal: "Internal error",
  outside_radius: "Both points must be within {km} km of the centre",
  too_close: "Home and work are too close to each other",
  route_failed: "Could not calculate a route",
  transit_failed: "No public transport connection found",
  bike_failed: "Could not calculate a bike route",
  quota_user: "Your daily limit has been reached",
  quota_global: "The daily limit has been reached",
  query_too_long: "Query too long",
  bad_place_id: "Invalid place id",
  place_not_found: "Place not found",
  place_outside: "This place is more than {km} km from the centre",
};
