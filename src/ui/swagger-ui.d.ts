/** The part of Swagger UI's bundle this UI uses. The package ships no types. */
declare module "swagger-ui-dist/swagger-ui-es-bundle.js" {
  type Options = {
    domNode: HTMLElement;
    url: string;
    deepLinking?: boolean;
    docExpansion?: "list" | "full" | "none";
    defaultModelsExpandDepth?: number;
    persistAuthorization?: boolean;
    tryItOutEnabled?: boolean;
  };
  const SwaggerUI: (options: Options) => unknown;
  export default SwaggerUI;
}
