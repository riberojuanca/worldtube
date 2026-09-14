module.exports = async (context) => {
  const { prepareNotices } = await import('./prepare-third-party-notices.mjs')
  await prepareNotices(context)
}
