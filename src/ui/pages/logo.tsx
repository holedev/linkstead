import { ErrorText } from "@/components/app";
import { api } from "../api";
import { useSession } from "../session";
import { useLoaded } from "../use-loaded";
import { LogoCard } from "./logo-card";

/** The Đơn vị's default logo for its QR - a Quản lý đơn vị's to set. */
const LogoPage = () => {
  const { unit } = useSession();
  const unitId = unit?.unitId ?? 0;
  const { data, error, reload } = useLoaded(unitId, (id) => api.unitLogo(id));

  if (!data) {
    return error ? <ErrorText>{error}</ErrorText> : <p className='text-muted-foreground'>Đang tải...</p>;
  }
  return (
    <LogoCard
      hasLogo={data.own}
      loadPreview={() => api.unitLogoPreview(unitId)}
      onRemove={async () => {
        await api.removeUnitLogo(unitId);
        reload();
      }}
      onUpload={async (file) => {
        await api.uploadUnitLogo(unitId, file);
        reload();
      }}
      removeLabel='Bỏ logo của đơn vị'
      stamp={`${unitId}|${data.own}`}
      title={`Logo trên QR của ${unit?.unitName}`}
    >
      <p>
        {data.own && "Đơn vị đang dùng logo riêng trên QR của mình."}
        {!data.own && "Đơn vị chưa đặt logo riêng nên QR đang dùng logo của Trường."}
      </p>
      <p>
        Logo này áp dụng cho mọi link của đơn vị đang để "Theo đơn vị". Link đã chọn logo riêng hoặc không logo thì giữ
        nguyên lựa chọn của nó.
      </p>
    </LogoCard>
  );
};

export { LogoPage };
