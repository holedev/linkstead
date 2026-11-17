import { type FormEvent, useState } from "react";
import { Button, ErrorText, Field } from "@/components/app";
import { api, type Link } from "../api";
import { messageOf } from "../messages";

/**
 * Who may open a Link (ADR-0006): a password visitors must give, and a moment after which it stops
 * opening. Both are optional, both can be undone, and neither frees the Mã link.
 */

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** An ISO moment as the `datetime-local` value it is in Vietnam. */
const toVietnamInput = (iso: string): string => new Date(Date.parse(iso) + VN_OFFSET_MS).toISOString().slice(0, 16);

/** A `datetime-local` value, read as Vietnam time, as an ISO moment. */
const fromVietnamInput = (value: string): string => new Date(`${value}:00+07:00`).toISOString();

const formatVietnam = (iso: string): string =>
  new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh"
  }).format(new Date(iso));

/** Whether the moment has passed - for a Link, whether it has expired. */
const isPast = (iso: string | null): boolean => iso !== null && Date.parse(iso) <= Date.now();

type PasswordChoice = "keep" | "set" | "remove";

const AccessForm = ({
  link,
  onChanged,
  onDone
}: {
  link: Link;
  onChanged: (link: Link) => void;
  onDone: () => void;
}) => {
  const [passwordChoice, setPasswordChoice] = useState<PasswordChoice>(link.hasPassword ? "keep" : "remove");
  const [password, setPassword] = useState("");
  const [expiry, setExpiry] = useState(link.expiresAt ? toVietnamInput(link.expiresAt) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const access: { password?: string | null; expiresAt?: string | null } = {};
    if (passwordChoice === "set") {
      access.password = password;
    } else if (passwordChoice === "remove" && link.hasPassword) {
      access.password = null;
    }
    const expiresAt = expiry ? fromVietnamInput(expiry) : null;
    if (expiresAt !== link.expiresAt) {
      access.expiresAt = expiresAt;
    }
    setBusy(true);
    setError("");
    try {
      onChanged(await api.setLinkAccess(link.code, access));
      onDone();
    } catch (failure) {
      setError(messageOf(failure));
      setBusy(false);
    }
  };

  return (
    <form className='space-y-5' onSubmit={save}>
      <fieldset className='space-y-2'>
        <legend className='mb-1 font-medium text-sm'>Mật khẩu</legend>
        <p className='text-muted-foreground text-xs'>
          Người mở link phải nhập mật khẩu trước khi được chuyển tới đích. Trang hỏi mật khẩu và bản xem trước trên
          Zalo, Facebook không để lộ đích. Hợp với tài liệu gửi cho một lớp, một hội đồng.
        </p>
        <div className='flex flex-wrap gap-x-4 gap-y-1 text-sm'>
          {link.hasPassword && (
            <label className='flex min-h-9 items-center gap-2'>
              <input
                checked={passwordChoice === "keep"}
                name='password-choice'
                onChange={() => setPasswordChoice("keep")}
                type='radio'
              />
              Giữ mật khẩu hiện tại
            </label>
          )}
          <label className='flex min-h-9 items-center gap-2'>
            <input
              checked={passwordChoice === "set"}
              name='password-choice'
              onChange={() => setPasswordChoice("set")}
              type='radio'
            />
            {link.hasPassword ? "Đổi mật khẩu" : "Đặt mật khẩu"}
          </label>
          <label className='flex min-h-9 items-center gap-2'>
            <input
              checked={passwordChoice === "remove"}
              name='password-choice'
              onChange={() => setPasswordChoice("remove")}
              type='radio'
            />
            {link.hasPassword ? "Bỏ mật khẩu" : "Không mật khẩu"}
          </label>
        </div>
        {passwordChoice === "set" && (
          <Field hint='4 đến 100 ký tự. Hiện rõ để bạn chép gửi cho người cần mở.' label='Mật khẩu mới'>
            {(props) => (
              <input
                {...props}
                autoComplete='off'
                maxLength={100}
                minLength={4}
                onChange={(event) => setPassword(event.target.value)}
                required
                spellCheck={false}
                value={password}
              />
            )}
          </Field>
        )}
      </fieldset>

      <fieldset className='space-y-2 border-t pt-4'>
        <legend className='sr-only'>Hạn dùng</legend>
        <Field
          hint='Giờ Việt Nam. Sau thời điểm này, người mở link thấy trang báo link đã hết hạn. Mã link vẫn được giữ; đặt ngày mới hoặc bỏ hạn là link mở lại.'
          label='Hết hạn lúc (không bắt buộc)'
        >
          {(props) => (
            <input
              {...props}
              onChange={(event) => setExpiry(event.target.value)}
              type='datetime-local'
              value={expiry}
            />
          )}
        </Field>
        {expiry && (
          <button
            className='font-medium text-primary text-sm underline-offset-4 hover:underline'
            onClick={() => setExpiry("")}
            type='button'
          >
            Bỏ hạn dùng
          </button>
        )}
      </fieldset>

      <ErrorText>{error}</ErrorText>
      <div className='flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
        <Button onClick={onDone}>Hủy</Button>
        <Button disabled={busy} type='submit' variant='primary'>
          {busy ? "Đang lưu..." : "Lưu"}
        </Button>
      </div>
    </form>
  );
};

export { AccessForm, formatVietnam, isPast };
