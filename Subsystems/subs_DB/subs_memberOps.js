// -- MemberOps Handler --

const db = require(`./subs_dbHandler`);

module.exports = {
    insertNewMember
}

async function insertNewMember(LCARS47, memberObj) {
    let newMemberResponse = await db.db_query(LCARS47.dbConnection, `Member_Ops`, `insert`, memberObj);

    if (newMemberResponse.inserted == 1) {
        return true;
    } else {
        return newMemberResponse;
    }
}