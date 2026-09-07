"""The two release readers and the matching rules, without a database (OVE-396).

Everything here is about bytes and decisions: what a Darwin Core zip and a
gzipped `simple.txt` actually contain, and which of two release rows a node
ends up with. None of it needs Postgres, so none of it is skipped when a
disposable database is not configured — which is exactly when a reader defect
would otherwise go unseen.
"""

from __future__ import annotations

import gzip
import io
import zipfile

import pytest

from app import wfo_gbif_crosswalk as crosswalk

WFO_HEADER = (
    "taxonID\tscientificName\ttaxonRank\tscientificNameAuthorship\t"
    "taxonomicStatus\tacceptedNameUsageID"
)


def wfo_row(
    identifier: str,
    name: str,
    *,
    status: str = "accepted",
    rank: str = "species",
) -> crosswalk.ReleaseRow:
    return crosswalk.ReleaseRow(
        identifier=identifier,
        scientific_name=name,
        authorship="L.",
        status=status,
        rank=rank,
        kingdom="Plantae",
    )



def test_the_wfo_reader_takes_a_darwin_core_classification_out_of_a_zip(tmp_path):
    archive = tmp_path / "wfo.zip"
    with zipfile.ZipFile(archive, "w") as zip_file:
        zip_file.writestr(
            "classification.csv",
            "\n".join(
                [
                    WFO_HEADER,
                    "wfo-0001029216\tSolanum lycopersicum\tspecies\tL.\tAccepted\t",
                    "wfo-0000000001\tLycopersicon esculentum\tspecies\tMill.\tSynonym\twfo-0001029216",
                    # A row with no identifier is not a row.
                    "\tNothing at all\tspecies\t\tAccepted\t",
                ]
            ),
        )

    rows = list(crosswalk.read_wfo_rows(archive, "classification.csv"))

    assert [row.identifier for row in rows] == [
        "wfo-0001029216",
        "wfo-0000000001",
    ]
    assert rows[0].status == "accepted"
    assert rows[0].kingdom == "Plantae"
    assert rows[1].accepted_identifier == "wfo-0001029216"


def test_the_wfo_reader_refuses_an_archive_without_the_member_it_was_promised(tmp_path):
    archive = tmp_path / "wfo.zip"
    with zipfile.ZipFile(archive, "w") as zip_file:
        zip_file.writestr("something_else.csv", WFO_HEADER)

    with pytest.raises(crosswalk.WfoGbifCrosswalkError, match="release_member_missing"):
        list(crosswalk.read_wfo_rows(archive, "classification.csv"))


def gbif_line(values: dict[int, str]) -> str:
    fields = ["\\N"] * crosswalk.GBIF_COLUMN_COUNT
    for index, value in values.items():
        fields[index] = value
    return "\t".join(fields)


def test_the_gbif_reader_streams_a_headerless_export_and_drops_derived_rows(tmp_path):
    archive = tmp_path / "simple.txt.gz"
    with gzip.open(archive, "wt", encoding="utf8") as handle:
        handle.write(
            "\n".join(
                [
                    gbif_line(
                        {
                            crosswalk.GBIF_COLUMN_ID: "2930137",
                            crosswalk.GBIF_COLUMN_STATUS: "ACCEPTED",
                            crosswalk.GBIF_COLUMN_RANK: "SPECIES",
                            crosswalk.GBIF_COLUMN_ORIGIN: "SOURCE",
                            crosswalk.GBIF_COLUMN_KINGDOM_KEY: "6",
                            crosswalk.GBIF_COLUMN_SCIENTIFIC_NAME: "Solanum lycopersicum L.",
                            crosswalk.GBIF_COLUMN_CANONICAL_NAME: "Solanum lycopersicum",
                            crosswalk.GBIF_COLUMN_AUTHORSHIP: "L.",
                        }
                    ),
                    # A name GBIF derived rather than read. It keeps a real
                    # usage key, so it is read; `origin` is what makes it lose
                    # a tie later.
                    gbif_line(
                        {
                            crosswalk.GBIF_COLUMN_ID: "9999999",
                            crosswalk.GBIF_COLUMN_STATUS: "ACCEPTED",
                            crosswalk.GBIF_COLUMN_ORIGIN: "AUTONYM",
                            crosswalk.GBIF_COLUMN_KINGDOM_KEY: "6",
                            crosswalk.GBIF_COLUMN_CANONICAL_NAME: "Solanum",
                        }
                    ),
                    # No canonical name is no row: nothing could match it.
                    gbif_line(
                        {
                            crosswalk.GBIF_COLUMN_ID: "8888888",
                            crosswalk.GBIF_COLUMN_ORIGIN: "SOURCE",
                        }
                    ),
                    "",
                ]
            )
        )

    rows = list(crosswalk.read_gbif_rows(archive))

    assert [row.identifier for row in rows] == ["2930137", "9999999"]
    assert rows[0].scientific_name == "Solanum lycopersicum"
    assert rows[0].status == "accepted"
    assert rows[0].rank == "species"
    assert rows[0].kingdom == "Plantae"
    assert rows[0].authorship == "L."
    assert rows[0].origin == "source"
    assert rows[1].origin == "autonym"


def test_a_release_whose_digest_is_not_the_pinned_one_is_refused(tmp_path):
    impostor = tmp_path / "release"
    impostor.write_bytes(b"not the release")

    with pytest.raises(crosswalk.WfoGbifCrosswalkError, match="release_digest_mismatch"):
        with crosswalk._released_file(crosswalk.WFO_RELEASE, 0, impostor):
            pass


def test_an_unknown_source_slug_is_refused_before_a_row_is_read():
    with pytest.raises(crosswalk.WfoGbifCrosswalkError, match="unknown_source"):
        crosswalk.crosswalk_source(object(), "world-flora-offline")


def test_the_reduced_row_keeps_only_what_the_manifest_allows():
    row = wfo_row("wfo-0001029216", "Solanum lycopersicum")
    assert set(row.projection()) == {
        "identifier",
        "scientificName",
        "authorship",
        "status",
        "rank",
        "kingdom",
        "acceptedIdentifier",
        "origin",
    }
    # No descriptions, no images, no occurrence anything.
    assert "description" not in row.projection()


def test_the_gbif_reader_reads_a_real_line_shape():
    # The first field separator matters more than it looks: a `simple.txt` line
    # split on whitespace instead of tabs would put the authorship in the name.
    line = gbif_line(
        {
            crosswalk.GBIF_COLUMN_ID: "5285750",
            crosswalk.GBIF_COLUMN_STATUS: "ACCEPTED",
            crosswalk.GBIF_COLUMN_RANK: "SPECIES",
            crosswalk.GBIF_COLUMN_ORIGIN: "SOURCE",
            crosswalk.GBIF_COLUMN_KINGDOM_KEY: "6",
            crosswalk.GBIF_COLUMN_CANONICAL_NAME: "Malus domestica",
            crosswalk.GBIF_COLUMN_AUTHORSHIP: "Borkh.",
        }
    )
    assert line.split("\t")[crosswalk.GBIF_COLUMN_CANONICAL_NAME] == "Malus domestica"


def test_reading_a_gzip_that_is_not_the_export_yields_nothing_rather_than_raising(tmp_path):
    archive = tmp_path / "simple.txt.gz"
    with gzip.open(archive, "wt", encoding="utf8") as handle:
        handle.write("one\tfield\tonly\n")

    assert list(crosswalk.read_gbif_rows(archive)) == []


def test_the_wfo_reader_survives_a_byte_that_is_not_utf8(tmp_path):
    archive = tmp_path / "wfo.zip"
    body = io.BytesIO()
    body.write((WFO_HEADER + "\n").encode("utf8"))
    body.write(b"wfo-0004000001\tQuercus robur\tspecies\tLinn\xc2\tAccepted\t\n")
    with zipfile.ZipFile(archive, "w") as zip_file:
        zip_file.writestr("classification.csv", body.getvalue())

    rows = list(crosswalk.read_wfo_rows(archive, "classification.csv"))

    # The name is intact; only the authorship lost a byte.
    assert rows[0].scientific_name == "Quercus robur"
    assert rows[0].identifier == "wfo-0004000001"


# ----------------------------------------------------------------------
# Which of two release rows a node ends up with
# ----------------------------------------------------------------------


def test_the_best_row_wins_and_a_repeat_of_the_same_identifier_changes_nothing():
    matches: dict[str, crosswalk.Match] = {}
    synonym = crosswalk.Match(wfo_row("wfo-1", "Beta vulgaris"), "name", (0, 1, 1))
    accepted = crosswalk.Match(wfo_row("wfo-2", "Beta vulgaris"), "name", (0, 3, 1))

    crosswalk._offer(matches, "node", synonym)
    crosswalk._offer(matches, "node", accepted)
    crosswalk._offer(matches, "node", accepted)

    assert matches["node"].row.identifier == "wfo-2"
    assert matches["node"].ambiguous is False


def test_a_tie_between_two_identifiers_is_marked_ambiguous_rather_than_guessed():
    matches: dict[str, crosswalk.Match] = {}
    left = crosswalk.Match(wfo_row("wfo-1", "Ficus indica"), "name", (0, 3, 1))
    right = crosswalk.Match(wfo_row("wfo-2", "Ficus indica"), "name", (0, 3, 1))

    crosswalk._offer(matches, "node", left)
    crosswalk._offer(matches, "node", right)

    assert matches["node"].ambiguous is True


def test_a_worse_row_never_displaces_a_better_one_and_never_makes_it_ambiguous():
    matches: dict[str, crosswalk.Match] = {}
    accepted = crosswalk.Match(wfo_row("wfo-2", "Beta vulgaris"), "name", (0, 3, 1))
    synonym = crosswalk.Match(wfo_row("wfo-1", "Beta vulgaris"), "name", (0, 1, 1))

    crosswalk._offer(matches, "node", accepted)
    crosswalk._offer(matches, "node", synonym)

    assert matches["node"].row.identifier == "wfo-2"
    assert matches["node"].ambiguous is False


def test_the_kingdom_decides_before_standing_does():
    plant = {"kingdom": "Plantae", "rank": "genus"}
    # A GBIF row from another kingdom scores below one from the node's own,
    # however well it stands in its own tree.
    own = crosswalk._score(
        plant,
        crosswalk.ReleaseRow("3244181", "Aa", None, "synonym", "genus", "Plantae"),
        crosswalk.GBIF,
    )
    foreign = crosswalk._score(
        plant,
        crosswalk.ReleaseRow("9995154", "Aa", None, "accepted", "genus", "Viruses"),
        crosswalk.GBIF,
    )
    assert own > foreign


def test_a_kingdom_both_sides_state_and_disagree_on_is_not_a_match():
    plant = {"kingdom": "Plantae"}
    virus = crosswalk.ReleaseRow("9995154", "Aa", None, "accepted", "genus", "Viruses")
    unknown = crosswalk.ReleaseRow("1", "Aa", None, "accepted", "genus", None)

    assert crosswalk._kingdoms_agree(plant, virus, crosswalk.GBIF) is False
    # Silence is not disagreement: the name still has to earn the match.
    assert crosswalk._kingdoms_agree(plant, unknown, crosswalk.GBIF) is True
    assert crosswalk._kingdoms_agree({"kingdom": None}, virus, crosswalk.GBIF) is True


def test_the_snapshot_digest_covers_the_release_and_what_it_projected():
    one = {"a": crosswalk.Match(wfo_row("wfo-1", "Beta vulgaris"), "name", (0,))}
    other = {"a": crosswalk.Match(wfo_row("wfo-2", "Beta vulgaris"), "name", (0,))}

    assert crosswalk._payload_digest(crosswalk.WFO, one) != crosswalk._payload_digest(
        crosswalk.WFO, other
    )
    # Two runs of one release over one graph describe the same thing.
    assert crosswalk._payload_digest(crosswalk.WFO, one) == crosswalk._payload_digest(
        crosswalk.WFO, dict(one)
    )


def test_a_name_gbif_published_beats_one_gbif_derived_under_the_same_name():
    plant = {"kingdom": "Plantae", "rank": "species"}
    published = crosswalk._score(
        plant,
        crosswalk.ReleaseRow(
            "1", "Solanum lycopersicum", None, "accepted", "species", "Plantae"
        ),
        crosswalk.GBIF,
    )
    derived = crosswalk._score(
        plant,
        crosswalk.ReleaseRow(
            "2",
            "Solanum lycopersicum",
            None,
            "accepted",
            "species",
            "Plantae",
            origin="autonym",
        ),
        crosswalk.GBIF,
    )
    # Both are real usage keys; only one of them is a name somebody published.
    assert published > derived
