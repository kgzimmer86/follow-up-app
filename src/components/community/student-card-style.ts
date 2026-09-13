// Matches the existing Follow Up contact-card palette, including status precedence.
function genderCategory(
  gender: string | null
) {
  const normalized =
    gender?.trim().toLowerCase()

  if (
    normalized === 'male' ||
    normalized === 'm' ||
    normalized === 'man'
  ) {
    return 'male'
  }

  if (
    normalized === 'female' ||
    normalized === 'f' ||
    normalized === 'woman'
  ) {
    return 'female'
  }

  return 'other'
}

export function stripeClass(
  gender: string | null,
  status: string
) {
  if (
    status ===
    'not_interested'
  ) {
    return 'bg-[#b42318]'
  }

  const category =
    genderCategory(gender)

  if (category === 'female') {
    return 'bg-[#d6339a]'
  }

  if (category === 'male') {
    return 'bg-[#2f80ed]'
  }

  return 'bg-[#98a2b3]'
}

export function cardClass(
  gender: string | null,
  status: string
) {
  if (
    status ===
    'not_interested'
  ) {
    return 'relative overflow-hidden rounded-[20px] border border-[#f1a7a3] bg-[#fff0f0] shadow-[0_1px_5px_rgba(16,24,40,0.03)]'
  }

  const category =
    genderCategory(gender)

  if (category === 'female') {
    return 'relative overflow-hidden rounded-[20px] border border-[#eadbe5] bg-[#fffafd] shadow-[0_1px_5px_rgba(16,24,40,0.03)]'
  }

  if (category === 'male') {
    return 'relative overflow-hidden rounded-[20px] border border-[#dbe8f8] bg-[#fbfdff] shadow-[0_1px_5px_rgba(16,24,40,0.03)]'
  }

  return 'relative overflow-hidden rounded-[20px] border border-[#e4e7ec] bg-white shadow-[0_1px_5px_rgba(16,24,40,0.03)]'
}

