// -- OpenAPI Interfaces --
// Minimal OpenAPI 3.1 type vocabulary used to describe LCARS47 API routes.
// Only the subset the bot actually needs is modelled; this is deliberately not
// a complete OpenAPI implementation.

export type OpenAPIType = 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null';

export interface OpenAPISchema {
  $ref?: string
  type?: OpenAPIType | OpenAPIType[]
  format?: string
  description?: string
  properties?: Record<string, OpenAPISchema>
  required?: string[]
  items?: OpenAPISchema
  additionalProperties?: boolean | OpenAPISchema
  enum?: ( string | number | boolean )[]
  oneOf?: OpenAPISchema[]
  example?: unknown
}

export interface OpenAPIMediaType {
  schema: OpenAPISchema
}

export interface OpenAPIResponse {
  description: string
  content?: Record<string, OpenAPIMediaType>
}

export interface OpenAPIRequestBody {
  description?: string
  required?: boolean
  content: Record<string, OpenAPIMediaType>
}

export interface OpenAPIParameter {
  name: string
  in: 'query' | 'header' | 'path' | 'cookie'
  description?: string
  required?: boolean
  schema: OpenAPISchema
}

export interface OpenAPIOperation {
  summary?: string
  description?: string
  operationId?: string
  tags?: string[]
  parameters?: OpenAPIParameter[]
  requestBody?: OpenAPIRequestBody
  responses: Record<string, OpenAPIResponse>
  security?: Record<string, string[]>[]
}

export type OpenAPIMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'options' | 'head';

export type OpenAPIPathItem = Partial<Record<OpenAPIMethod, OpenAPIOperation>>;

/**
 * A map of API paths to their operations. Route modules contribute fragments of
 * this shape; the loader merges them into the complete document.
 */
export type OpenAPIPaths = Record<string, OpenAPIPathItem>;

export interface OpenAPISecurityScheme {
  type: 'apiKey' | 'http'
  in?: 'header' | 'query' | 'cookie'
  name?: string
  scheme?: string
  description?: string
}

export interface OpenAPITag {
  name: string
  description?: string
}

export interface OpenAPIServer {
  url: string
  description?: string
}

export interface OpenAPIDocument {
  openapi: string
  info: {
    title: string
    version: string
    description?: string
    license?: {
      name: string
      url?: string
    }
  }
  servers?: OpenAPIServer[]
  tags?: OpenAPITag[]
  paths: OpenAPIPaths
  components?: {
    schemas?: Record<string, OpenAPISchema>
    securitySchemes?: Record<string, OpenAPISecurityScheme>
  }
}
