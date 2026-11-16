import { ArrowLeftIcon, CircleAlertIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link as RouterLink } from "react-router";

/**
 * The API's documentation, for the developer an Đơn vị hands a Khóa API to - who may have no
 * account, so this page asks for none. Swagger UI is loaded only here: it is larger than the rest
 * of the UI together.
 */
const ApiDocsPage = () => {
  const mount = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    Promise.all([import("swagger-ui-dist/swagger-ui-es-bundle.js"), import("swagger-ui-dist/swagger-ui.css")])
      .then(([{ default: SwaggerUI }]) => {
        if (current && mount.current) {
          SwaggerUI({
            deepLinking: false,
            defaultModelsExpandDepth: 0,
            docExpansion: "list",
            domNode: mount.current,
            // A pasted key stays for this visit only, not in the browser's storage.
            persistAuthorization: false,
            url: "/api/openapi.json"
          });
        }
      })
      .catch(() => current && setFailed(true));
    return () => {
      current = false;
    };
  }, []);

  return (
    <div className='min-h-dvh bg-white'>
      <header className='border-b'>
        <div className='mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3'>
          <RouterLink
            className='inline-flex items-center gap-1 text-muted-foreground text-sm hover:text-foreground'
            to='/'
          >
            <ArrowLeftIcon className='size-4' />
            OU Link
          </RouterLink>
          <h1 className='font-semibold'>Tài liệu API</h1>
        </div>
      </header>
      <div className='mx-auto max-w-5xl space-y-3 px-4 pt-4 text-sm'>
        <p>
          Cần một Khóa API do Quản lý đơn vị cấp trong mục <strong>Khóa API</strong>. Bấm <strong>Authorize</strong> và
          dán khóa vào để thử từng lệnh ngay trên trang này - các lệnh thử là thật, tác động lên link thật của đơn vị.
        </p>
        <p className='rounded-md bg-amber-50 px-3 py-2 text-amber-900'>
          Bản thử nghiệm trên tên miền tạm. <strong>Chưa in QR nào</strong> từ các link này.
        </p>
        {failed && (
          <p className='flex items-center gap-2 text-destructive'>
            <CircleAlertIcon className='size-4' />
            Không tải được trang tài liệu. Bản mô tả API vẫn có ở{" "}
            <a className='underline' href='/api/openapi.json'>
              /api/openapi.json
            </a>
            .
          </p>
        )}
      </div>
      {/* Swagger UI's own tables are wider than a phone: they scroll inside, not the page. */}
      <div className='mx-auto max-w-5xl overflow-x-auto pb-10' ref={mount} />
    </div>
  );
};

export { ApiDocsPage };
