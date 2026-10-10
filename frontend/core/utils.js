export const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c],
  );

export const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2);

export const pad = (n) => String(n).padStart(2, '0');

export const iso = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const today = () => iso(new Date());

export const addDays = (dateString, days) => {
  const date = new Date(dateString + 'T12:00:00');
  date.setDate(date.getDate() + days);
  return iso(date);
};

export const dmy = (value) => (value ? value.split('-').reverse().join('/') : '');

export const money = (value) => {
  const amount = Number(value || 0);

  return (
    '₹' +
    amount.toLocaleString('en-IN', {
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    })
  );
};

export const parseAmt = (value) => {
  const amount = Number(String(value ?? '').replace(/[,₹\s]|rs\.?/gi, ''));

  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : NaN;
};

export const sum = (items) => items.reduce((total, item) => total + item.amount, 0);

export function download(name, text, type) {
  const anchor = document.createElement('a');

  anchor.href = URL.createObjectURL(new Blob([text], { type }));
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  setTimeout(() => URL.revokeObjectURL(anchor.href), 1500);
}

export const csvCell = (value) =>
  `"${String(value ?? '')
    .replace(/"/g, '""')
    .replace(/^([=+\-@\t\r\n])/, "'$1")}"`;

export function readFileB64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function compress(file) {
  if (!/^image\//.test(file.type)) {
    throw new Error('Please choose an image file.');
  }

  const url = URL.createObjectURL(file);

  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();

      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Could not read that image (try a JPG or PNG).'));
      image.src = url;
    });

    for (const [max, quality] of [
      [1600, 0.72],
      [1280, 0.6],
      [960, 0.5],
    ]) {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');

      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);

      const context = canvas.getContext('2d');

      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(img, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

      if (blob && blob.size < 1100000) {
        return {
          mime: 'image/jpeg',
          data: await readFileB64(blob),
          preview: URL.createObjectURL(blob),
        };
      }
    }

    throw new Error('Image is too large.');
  } finally {
    URL.revokeObjectURL(url);
  }
}
