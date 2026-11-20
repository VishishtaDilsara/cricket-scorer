package db.migration;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

/**
 * Deleting an admin (a row in app_user) deletes everything in their space: their scorer accounts, teams, players,
 * tournaments, matches and every ball. Rows that only mention a user in passing keep the row and lose the link.
 *
 * Written in Java because the existing foreign keys have generated names that differ between PostgreSQL
 * (production) and H2 (local runs): each one is looked up by table and column, dropped, and re-added with an
 * ON DELETE rule and a predictable name.
 */
public class V7__delete_admin_cascades extends BaseJavaMigration {

    private record Fk(String table, String column, String refTable, String onDelete) {}

    private static final List<Fk> FKS = List.of(
        // What an admin owns goes with them.
        new Fk("team", "owner_id", "app_user", "CASCADE"),
        new Fk("player", "owner_id", "app_user", "CASCADE"),
        new Fk("tournament", "owner_id", "app_user", "CASCADE"),
        new Fk("cricket_match", "owner_id", "app_user", "CASCADE"),
        new Fk("match_scorer", "user_id", "app_user", "CASCADE"),
        // Mentions of a user that are not ownership: keep the row, clear the link.
        new Fk("player", "user_id", "app_user", "SET NULL"),
        new Fk("cricket_match", "created_by", "app_user", "SET NULL"),
        new Fk("table_adjustment", "created_by", "app_user", "SET NULL"),
        // When a team goes, its tournament entries and table adjustments go too; a leftover match keeps its score.
        new Fk("tournament_team", "team_id", "team", "CASCADE"),
        new Fk("table_adjustment", "team_id", "team", "CASCADE"),
        new Fk("cricket_match", "team_a_id", "team", "SET NULL"),
        new Fk("cricket_match", "team_b_id", "team", "SET NULL"));

    @Override
    public void migrate(Context context) throws Exception {
        Connection c = context.getConnection();
        try (Statement st = c.createStatement()) {
            // Scorers belong to the admin in org_id. A scorer whose admin is already gone can never be used; remove it
            // so the new link can be added.
            st.executeUpdate("delete from match_scorer where user_id in "
                    + "(select u.id from app_user u where u.org_id is not null and not exists (select 1 from app_user a where a.id = u.org_id))");
            st.executeUpdate("delete from app_user where org_id is not null and not exists (select 1 from app_user a where a.id = app_user.org_id)");

            for (Fk fk : FKS) {
                for (String name : constraintNames(c, fk.table(), fk.column())) {
                    st.executeUpdate("alter table " + fk.table() + " drop constraint \"" + name + "\"");
                }
                st.executeUpdate("alter table " + fk.table() + " add constraint " + fk.table() + "_" + fk.column() + "_fkey"
                        + " foreign key (" + fk.column() + ") references " + fk.refTable() + "(id) on delete " + fk.onDelete());
            }
            // An admin's own org_id is their id; a scorer's is their admin's. Deleting an admin deletes their scorers.
            st.executeUpdate("alter table app_user add constraint app_user_org_id_fkey"
                    + " foreign key (org_id) references app_user(id) on delete cascade");
        }
    }

    /** Names of the foreign keys on table.column in the current schema (normally exactly one). */
    private static List<String> constraintNames(Connection c, String table, String column) throws Exception {
        String sql = "select tc.constraint_name from information_schema.table_constraints tc"
                + " join information_schema.key_column_usage k"
                + " on k.constraint_name = tc.constraint_name and k.constraint_schema = tc.constraint_schema"
                + " where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = current_schema"
                + " and lower(tc.table_name) = ? and lower(k.column_name) = ?";
        List<String> out = new ArrayList<>();
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, table);
            ps.setString(2, column);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) out.add(rs.getString(1));
            }
        }
        return out;
    }
}
