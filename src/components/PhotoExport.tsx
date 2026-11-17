import { useEffect, useId, useRef, useState } from 'react';
import { canSharePng, downloadPng } from '../export/exportPng';

export type PhotoExportImage = { file: File; width: number; height: number };

export function PhotoExport({ image, onBack }: { image: PhotoExportImage; onBack: () => void }) {
  const [url, setUrl] = useState('');
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const hintId = useId();
  const canShare = canSharePng(image.file);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(image.file);
    setUrl(objectUrl);
    headingRef.current?.focus();
    return () => URL.revokeObjectURL(objectUrl);
  }, [image.file]);

  async function share() {
    if (sharing) return;
    setSharing(true);
    setMessage('');
    try {
      // Encode before this tap: Safari needs transient user activation for share.
      await navigator.share({ files: [image.file] });
      setMessage('共有メニューを閉じました。保存した画像は「写真」アプリで確認できます。');
    } catch (err) {
      setMessage(err instanceof Error && err.name === 'AbortError'
        ? '共有をキャンセルしました。もう一度開くか、画像を長押しして保存できます。'
        : '共有メニューを開けませんでした。もう一度試すか、画像を長押しして保存してください。');
    } finally { setSharing(false); }
  }

  return <div className="photo-export">
    <h3 ref={headingRef} tabIndex={-1}>画像を「写真」に保存</h3>
    <p id={hintId} className="setting-hint">{canShare
      ? '「共有メニューを開く」を押し、iPhoneでは「画像を保存」を選ぶと「写真」アプリに保存できます。'
      : 'iPhoneでは下の画像を長押しして「写真に保存」または「画像を保存」を選んでください。メニューが出ない場合はSafariで開いてお試しください。'}</p>
    {url && <img className="photo-export-preview" src={url} alt="保存する作品のPNG画像" width={image.width} height={image.height} />}
    <p className="photo-export-size">{image.width} × {image.height} px · PNG</p>
    {canShare && <button className="primary" disabled={sharing} aria-describedby={hintId} onClick={share}>{sharing ? '共有メニューを開いています…' : '共有メニューを開く'}</button>}
    {canShare && <p className="setting-hint">画像の長押しからも保存できます。</p>}
    <p className="export-feedback" role="status">{message}</p>
    <button disabled={sharing} onClick={() => {
      downloadPng(image.file);
      setMessage('PNGのダウンロードを開始しました。iPhoneでは「ファイル」に保存されます。');
    }}>PNGをファイルに保存</button>
    <button disabled={sharing} onClick={onBack}>書き出し方法に戻る</button>
  </div>;
}
