import re
import unittest
from datetime import datetime, timezone

from fastapi import HTTPException

from app.api.knowledge import require_member_permission
from app.api.organizations import organization_out
from app.models.organization import MemberRole, Organization, OrganizationMember, new_invite_code


class TeamPermissionTests(unittest.TestCase):
    def test_invite_code_is_short_and_unambiguous_to_enter(self):
        code = new_invite_code()
        self.assertRegex(code, re.compile(r"^[A-Z0-9]{8}$"))

    def test_member_permission_is_enforced(self):
        member = OrganizationMember(role=MemberRole.member, can_add_knowledge=False)
        with self.assertRaises(HTTPException) as raised:
            require_member_permission(member, "can_add_knowledge", "禁止添加")
        self.assertEqual(raised.exception.status_code, 403)

    def test_admin_bypasses_member_level_switches(self):
        admin = OrganizationMember(role=MemberRole.admin, can_use_ai=False)
        require_member_permission(admin, "can_use_ai", "禁止使用 AI")

    def test_member_cannot_see_invite_code_in_org_response(self):
        org = Organization(
            id=9,
            name="团队知识库",
            description=None,
            owner_id=1,
            invite_code="ABCD1234",
            invite_enabled=True,
            created_at=datetime.now(timezone.utc),
        )
        member = OrganizationMember(
            role=MemberRole.member,
            can_add_knowledge=False,
            can_delete_own=True,
            can_use_ai=False,
        )
        result = organization_out(org, member, 3)
        self.assertIsNone(result.invite_code)
        self.assertFalse(result.can_add_knowledge)
        self.assertFalse(result.can_use_ai)


if __name__ == "__main__":
    unittest.main()
