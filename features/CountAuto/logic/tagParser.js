// =================================================================
// 🏷️ features/CountAuto/logic/tagParser.js — สกัดแท็กจากข้อความ
// =================================================================

function getTagsFromContent(message) {
    if (!message || !message.content) return [];

    const tagList = [];
    const mentionRegex = /<@!?(\d+)>/g;
    let match;

    while ((match = mentionRegex.exec(message.content)) !== null) {
        const member = message.guild.members.cache.get(match[1]);
        if (member) {
            addPersonToList(tagList, member);
        }
    }

    return tagList;
}

function addPersonToList(list, member) {
    if (!list.some(p => p.id === member.id)) {
        list.push({
            id: member.id,
            nickname: (member.nickname || member.user.displayName || member.user.username).trim(),
            username: member.user.username
        });
    }
}

module.exports = { getTagsFromContent, addPersonToList };