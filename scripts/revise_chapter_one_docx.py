#!/usr/bin/env python3
"""Apply focused Chapter I revisions to the thesis DOCX using OOXML only."""

from copy import deepcopy
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZIP_DEFLATED, ZipFile
import xml.etree.ElementTree as ET


W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
XML = "http://www.w3.org/XML/1998/namespace"
NS = {"w": W}
ET.register_namespace("w", W)


def paragraph_text(paragraph: ET.Element) -> str:
    return "".join(node.text or "" for node in paragraph.findall(".//w:t", NS))


def replace_paragraph_text(paragraph: ET.Element, text: str) -> None:
    runs = paragraph.findall("w:r", NS)
    preserved_rpr = None
    if runs:
        rpr = runs[0].find("w:rPr", NS)
        if rpr is not None:
            preserved_rpr = deepcopy(rpr)

    for child in list(paragraph):
        if child.tag != f"{{{W}}}pPr":
            paragraph.remove(child)

    run = ET.SubElement(paragraph, f"{{{W}}}r")
    if preserved_rpr is not None:
        run.append(preserved_rpr)
    text_node = ET.SubElement(run, f"{{{W}}}t")
    if text.startswith(" ") or text.endswith(" "):
        text_node.set(f"{{{XML}}}space", "preserve")
    text_node.text = text


def copy_paragraph_format(source: ET.Element, target: ET.Element) -> None:
    source_ppr = source.find("w:pPr", NS)
    target_ppr = target.find("w:pPr", NS)
    if target_ppr is not None:
        target.remove(target_ppr)
    if source_ppr is not None:
        target.insert(0, deepcopy(source_ppr))

    source_run = source.find("w:r", NS)
    target_run = target.find("w:r", NS)
    if source_run is None or target_run is None:
        return
    source_rpr = source_run.find("w:rPr", NS)
    target_rpr = target_run.find("w:rPr", NS)
    if target_rpr is not None:
        target_run.remove(target_rpr)
    if source_rpr is not None:
        target_run.insert(0, deepcopy(source_rpr))


def make_paragraph(reference: ET.Element, text: str) -> ET.Element:
    paragraph = deepcopy(reference)
    replace_paragraph_text(paragraph, text)
    return paragraph


def table_rows(table: ET.Element) -> list[ET.Element]:
    return table.findall("w:tr", NS)


def table_cells(row: ET.Element) -> list[ET.Element]:
    return row.findall("w:tc", NS)


def set_cell_text(cell: ET.Element, text: str) -> None:
    paragraph = cell.find("w:p", NS)
    if paragraph is None:
        paragraph = ET.SubElement(cell, f"{{{W}}}p")
    replace_paragraph_text(paragraph, text)
    for extra in list(cell.findall("w:p", NS))[1:]:
        cell.remove(extra)


def configure_table(table: ET.Element, rows: list[list[str]]) -> None:
    existing_rows = table_rows(table)
    if not existing_rows:
        raise RuntimeError("La tabla de referencia no contiene filas")
    while len(existing_rows) < len(rows):
        new_row = deepcopy(existing_rows[-1])
        table.append(new_row)
        existing_rows.append(new_row)
    for extra in existing_rows[len(rows):]:
        table.remove(extra)
    for row_element, values in zip(table_rows(table), rows):
        cells = table_cells(row_element)
        if len(cells) != len(values):
            raise RuntimeError("La geometría de la tabla de referencia no coincide")
        for cell, value in zip(cells, values):
            set_cell_text(cell, value)

    for index, row in enumerate(table_rows(table)):
        trpr = row.find("w:trPr", NS)
        if trpr is None:
            trpr = ET.Element(f"{{{W}}}trPr")
            row.insert(0, trpr)
        if trpr.find("w:cantSplit", NS) is None:
            ET.SubElement(trpr, f"{{{W}}}cantSplit")
        if index == 0 and trpr.find("w:tblHeader", NS) is None:
            ET.SubElement(trpr, f"{{{W}}}tblHeader")


def strip_numbering(paragraph: ET.Element) -> None:
    ppr = paragraph.find("w:pPr", NS)
    if ppr is None:
        return
    numpr = ppr.find("w:numPr", NS)
    if numpr is not None:
        ppr.remove(numpr)


def clear_highlight(element: ET.Element) -> None:
    for highlight in list(element.findall(".//w:highlight", NS)):
        parent = None
        for candidate in element.iter():
            if highlight in list(candidate):
                parent = candidate
                break
        if parent is not None:
            parent.remove(highlight)


def set_spacing_before(paragraph: ET.Element, twips: int) -> None:
    ppr = paragraph.find("w:pPr", NS)
    if ppr is None:
        ppr = ET.Element(f"{{{W}}}pPr")
        paragraph.insert(0, ppr)
    spacing = ppr.find("w:spacing", NS)
    if spacing is None:
        spacing = ET.SubElement(ppr, f"{{{W}}}spacing")
    spacing.set(f"{{{W}}}before", str(twips))


def set_page_break_before(paragraph: ET.Element) -> None:
    ppr = paragraph.find("w:pPr", NS)
    if ppr is None:
        ppr = ET.Element(f"{{{W}}}pPr")
        paragraph.insert(0, ppr)
    if ppr.find("w:pageBreakBefore", NS) is None:
        ET.SubElement(ppr, f"{{{W}}}pageBreakBefore")


def find_paragraph(paragraphs: list[ET.Element], prefix: str) -> ET.Element:
    for paragraph in paragraphs:
        if paragraph_text(paragraph).startswith(prefix):
            return paragraph
    raise RuntimeError(f"No se encontró el párrafo que inicia con: {prefix}")


def main() -> None:
    source = Path("Plantilla.docx")
    target = Path("Tesis_Capitulos_I_y_III_corregidos.docx")

    with TemporaryDirectory(prefix="tesis-capitulo-i-") as temp_dir:
        temp = Path(temp_dir)
        with ZipFile(source) as archive:
            archive.extractall(temp)

        document_path = temp / "word" / "document.xml"
        tree = ET.parse(document_path)
        root = tree.getroot()
        body = root.find("w:body", NS)
        if body is None:
            raise RuntimeError("El documento no contiene un cuerpo OOXML válido")

        paragraphs = body.findall("w:p", NS)
        context = find_paragraph(paragraphs, "Contexto:")
        impact = find_paragraph(paragraphs, "Impacto:")
        need = find_paragraph(paragraphs, "Necesidad:")
        prose_reference = find_paragraph(paragraphs, "El estado del arte permite examinar")

        replace_paragraph_text(
            context,
            "La pérdida y el desperdicio de alimentos constituyen un problema global que "
            "compromete la eficiencia de los sistemas alimentarios. En 2022 se desperdiciaron "
            "aproximadamente 1.050 millones de toneladas de alimentos en hogares, servicios "
            "alimentarios y comercio minorista, equivalentes a 132 kilogramos por persona al "
            "año (Programa de las Naciones Unidas para el Medio Ambiente [PNUMA], 2024). En "
            "América Latina y el Caribe, las pérdidas y desperdicios alcanzan hasta 127 "
            "millones de toneladas anuales (Organización de las Naciones Unidas para la "
            "Alimentación y la Agricultura [FAO], 2016). Estas cifras evidencian la necesidad "
            "de mejorar el aprovechamiento de excedentes aptos para el consumo humano.",
        )
        replace_paragraph_text(
            impact,
            "La presente investigación desarrolla un prototipo académico independiente para la "
            "gestión descentralizada de donaciones alimentarias y toma la ciudad de Manta, "
            "provincia de Manabí, únicamente como escenario geográfico de referencia. El "
            "proyecto no está adscrito a un banco de alimentos existente ni presupone que una "
            "institución determinada vaya a implementarlo. Al momento de realizar la "
            "investigación tampoco se dispone de una red confirmada de donantes o beneficiarios, "
            "de un volumen operativo ni de una serie histórica de donaciones. En consecuencia, "
            "el alcance se limita al diseño y validación controlada de una plataforma mediante "
            "datos y escenarios simulados, con capacidad para registrar volúmenes variables por "
            "producto, lote, cantidad, unidad de medida, fecha de vencimiento y ubicación de "
            "custodia.",
        )
        replace_paragraph_text(
            need,
            "En una eventual operación basada en este modelo descentralizado, la gestión manual "
            "dispersaría la información y dificultaría conocer el stock disponible en tiempo "
            "real. Esta situación impediría "
            "priorizar adecuadamente los productos próximos a caducar mediante el criterio FEFO "
            "(First Expired, First Out), limitaría la trazabilidad desde el donante hasta el "
            "beneficiario y sobrecargaría la coordinación mediante canales informales. Por ello, se "
            "requiere una plataforma web que centralice lógicamente las existencias distribuidas, "
            "registre sus movimientos y genere información verificable sobre los volúmenes "
            "recibidos, asignados, entregados y dados de baja.",
        )
        for paragraph in (context, impact, need):
            copy_paragraph_format(prose_reference, paragraph)

        obsolete_prefixes = (
            "Invisibilidad del stock:",
            "Riesgo de caducidad:",
            "Opacidad en la trazabilidad:",
            "Saturación operativa:",
        )
        for paragraph in list(body.findall("w:p", NS)):
            if paragraph_text(paragraph).startswith(obsolete_prefixes):
                body.remove(paragraph)

        paragraphs = body.findall("w:p", NS)
        central_question = find_paragraph(paragraphs, "¿Cómo optimizar la gestión logística")
        replace_paragraph_text(
            central_question,
            "¿Cómo diseñar y desarrollar una plataforma web que permita gestionar el "
            "inventario y la trazabilidad de las donaciones bajo un modelo de custodia "
            "descentralizada en un escenario simulado de banco de alimentos en Manta?",
        )
        first_question = find_paragraph(paragraphs, "¿Cuáles son los requerimientos funcionales")
        replace_paragraph_text(
            first_question,
            "¿Cuáles son los requerimientos funcionales y técnicos que debería satisfacer "
            "una plataforma dirigida a los potenciales donantes, operadores, administradores y "
            "solicitantes de un modelo descentralizado?",
        )
        general_heading = find_paragraph(paragraphs, "Objetivos General")
        replace_paragraph_text(general_heading, "Objetivo General")
        first_specific = find_paragraph(paragraphs, "Determinar los requerimientos funcionales")
        replace_paragraph_text(
            first_specific,
            "Determinar los requerimientos funcionales y técnicos necesarios para la gestión "
            "de donaciones en un modelo descentralizado, mediante el análisis de procesos, "
            "escenarios de uso y consulta a participantes que representen usuarios potenciales.",
        )
        general = find_paragraph(paragraphs, "Desarrollar una plataforma web de gestión descentralizada")
        replace_paragraph_text(
            general,
            "Desarrollar una plataforma web para la gestión descentralizada de inventarios "
            "que permita registrar y ofertar productos donados, así como garantizar la "
            "trazabilidad de las donaciones en un escenario simulado de banco de alimentos en "
            "Manta, concebido sin una infraestructura física central de almacenamiento.",
        )

        third = find_paragraph(paragraphs, "Desarrollo de un sistema de trazabilidad")
        second = find_paragraph(paragraphs, "Diseñar la arquitectura del sistema")
        second_text = paragraph_text(second)
        if not second_text.endswith("."):
            replace_paragraph_text(second, second_text + ".")
        replace_paragraph_text(
            third,
            "Desarrollar un sistema de trazabilidad y logística que registre el ciclo de vida "
            "de la donación, desde la notificación del donante hasta la confirmación de la "
            "recepción por parte del beneficiario.",
        )

        evaluation = deepcopy(third)
        replace_paragraph_text(
            evaluation,
            "Evaluar la funcionalidad, usabilidad y aceptación de la plataforma mediante "
            "pruebas controladas con participantes que representen perfiles potenciales de "
            "donante, operador, administrador y solicitante, utilizando escenarios simulados a "
            "fin de identificar oportunidades de mejora.",
        )
        third_index = list(body).index(third)
        body.insert(third_index + 1, evaluation)

        # Reorganize Chapter III as methodology and move implementation evidence to Chapter IV.
        paragraphs = body.findall("w:p", NS)
        chapter_three = find_paragraph(paragraphs, "Capítulo III: Metodología")
        replace_paragraph_text(
            chapter_three,
            "Capítulo III: Metodología de la Investigación y Desarrollo del Software",
        )
        old_intro_heading = find_paragraph(paragraphs, "Introducción a la Metodología")
        research_heading = find_paragraph(paragraphs, "Metodología de la Investigación")
        methods_heading = find_paragraph(paragraphs, "Métodos y técnicas empleados")
        development_heading = find_paragraph(paragraphs, "Metodología de Desarrollo de Software")
        body_reference = find_paragraph(paragraphs, "La investigación se enmarca")
        table_31_caption = find_paragraph(paragraphs, "Tabla 3.1.")
        collection_heading = find_paragraph(paragraphs, "Recolección y Análisis de Requisitos")
        chapter_four = find_paragraph(paragraphs, "Capítulo IV: Implementación")
        coding_heading = find_paragraph(paragraphs, "Desarrollo/Codificación")
        integration_heading = find_paragraph(paragraphs, "Integración")

        elements = list(body)
        caption_index = elements.index(table_31_caption)
        comparison_table = None
        for candidate in reversed(elements[:caption_index]):
            if candidate.tag == f"{{{W}}}tbl":
                comparison_table = deepcopy(candidate)
                break
        if comparison_table is None:
            raise RuntimeError("No se encontró una tabla de referencia para la comparación")

        configure_table(
            comparison_table,
            [
                ["Enfoque", "Características relevantes", "Adecuación al proyecto"],
                ["XP", "Iteraciones cortas, diseño simple, retroalimentación frecuente, refactorización y pruebas continuas (Beck & Andres, 2004).", "Alta: favorece el trabajo incremental de un desarrollador y el control técnico mediante pruebas."],
                ["Scrum", "Marco basado en un equipo Scrum, responsabilidades definidas, eventos y artefactos para alcanzar un Objetivo del Producto (Schwaber & Sutherland, 2020).", "Media: aporta planificación iterativa, pero varios roles y eventos pierden sentido en un proyecto individual."],
                ["Kanban", "Gestiona el flujo mediante una definición explícita del trabajo, control del trabajo en curso y métricas de flujo (Coleman et al., 2025).", "Media: ayuda a visualizar tareas, pero prescribe menos prácticas de ingeniería que XP."],
                ["Selección", "XP adaptada, complementada con un tablero de trabajo para visualizar el avance.", "Se priorizan las prácticas técnicas y la entrega incremental; no se afirmará la aplicación de roles inexistentes."],
            ],
        )

        new_chapter_three = [
            make_paragraph(old_intro_heading, "Introducción a la metodología"),
            make_paragraph(
                body_reference,
                "Este capítulo establece el procedimiento previsto para estudiar el problema, "
                "definir el escenario de referencia y planificar el desarrollo del prototipo. "
                "La descripción de funcionalidades construidas, rutas de código, funciones de "
                "PostgreSQL, arquitectura implementada y resultados de pruebas se reserva para "
                "el Capítulo IV, debido a que constituye evidencia de ejecución y no parte del "
                "diseño metodológico.",
            ),
            make_paragraph(research_heading, "Metodología de la investigación"),
            make_paragraph(
                body_reference,
                "La investigación es aplicada y de alcance descriptivo, con diseño no "
                "experimental. Su propósito es formular y evaluar un prototipo de gestión de "
                "donaciones bajo custodia descentralizada. Manta se utiliza solo como escenario "
                "geográfico de referencia; el estudio no analiza un banco de alimentos en "
                "funcionamiento ni atribuye la propuesta a una institución determinada.",
            ),
            make_paragraph(methods_heading, "Técnicas, instrumentos y evidencia disponible"),
            make_paragraph(
                body_reference,
                "La revisión documental comprende los antecedentes citados en el Capítulo II, "
                "la normativa ecuatoriana pertinente y la documentación técnica del prototipo. "
                "A partir de estas fuentes se establecen como categorías de análisis el actor, "
                "producto, lote, cantidad, unidad de medida, vencimiento, ubicación de custodia, "
                "estado y evidencia de entrega. Estas categorías orientan la formulación de "
                "requisitos y escenarios de uso.",
            ),
            make_paragraph(
                body_reference,
                "Para evaluar la pertinencia y utilidad del producto se planifica una validación "
                "externa mediante una entrevista semiestructurada y una prueba guiada del "
                "prototipo. El participante deberá poseer experiencia en donaciones, asistencia "
                "social, inventarios, logística, distribución de alimentos o gestión de una "
                "organización comunitaria. No es indispensable que represente a un banco de "
                "alimentos formalmente constituido, pero sí que pueda valorar razonadamente el "
                "flujo propuesto desde una perspectiva operativa o social.",
            ),
            make_paragraph(methods_heading, "Estado y alcance de la validación externa"),
            make_paragraph(
                body_reference,
                "Al cierre de esta versión todavía no se ha confirmado al participante externo; "
                "por tanto, la fecha, identificación del perfil y resultados permanecen pendientes "
                "y no se presentan como evidencia obtenida. La versión final de la investigación "
                "deberá completar estos datos y trasladar los resultados al Capítulo IV. Esta "
                "validación permitirá determinar si el sistema resulta comprensible y potencialmente "
                "útil, pero no demostrará su impacto real sobre el desperdicio de alimentos, pues "
                "para ello se necesitaría una implementación operativa y mediciones longitudinales.",
            ),
            make_paragraph(methods_heading, "Proceso AS-IS de referencia"),
            make_paragraph(
                body_reference,
                "Debido a la ausencia de una organización observada, el AS-IS se formula como un "
                "escenario hipotético derivado de la revisión documental. En este escenario, el "
                "donante comunica un excedente por teléfono, mensajería o correo; un coordinador "
                "registra manualmente el producto, la cantidad, la fecha de vencimiento y la "
                "ubicación; las solicitudes se reciben por canales separados; y la asignación se "
                "realiza comparando registros no sincronizados antes de coordinar el retiro y la "
                "entrega. El cierre depende de confirmaciones manuales y archivos dispersos.",
            ),
            make_paragraph(
                body_reference,
                "Este flujo puede producir desactualización del stock, duplicidad de asignaciones, "
                "escasa prioridad de los lotes próximos a vencer y dificultad para reconstruir "
                "quién autorizó o recibió cada movimiento. Estas situaciones constituyen hipótesis "
                "de diseño que deberán contrastarse con evidencia de campo cuando exista una "
                "organización contraparte; no se presentan como hallazgos observados en Manta.",
            ),
            make_paragraph(development_heading, "Metodología de desarrollo de software"),
            make_paragraph(body_reference, ""),
            make_paragraph(methods_heading, "Comparación de enfoques ágiles"),
            make_paragraph(
                body_reference,
                "Para seleccionar el proceso de desarrollo se comparan XP, Scrum y Kanban. XP "
                "integra prácticas de ingeniería orientadas a cambios frecuentes y calidad interna "
                "(Beck & Andres, 2004). Scrum organiza el trabajo mediante un equipo, objetivos, "
                "eventos y artefactos (Schwaber & Sutherland, 2020), mientras que Kanban se centra "
                "en definir y visualizar el flujo y controlar el trabajo en curso (Coleman et al., "
                "2025). La comparación se resume a continuación.",
            ),
            comparison_table,
            make_paragraph(table_31_caption, "Tabla 3.1. Comparación de XP, Scrum y Kanban para la planificación del prototipo."),
            make_paragraph(methods_heading, "Selección y adaptación de XP"),
            make_paragraph(
                body_reference,
                "Se selecciona XP de forma adaptada porque el desarrollo es individual, los "
                "requisitos pueden refinarse durante la construcción y el dominio contiene reglas "
                "sensibles de inventario. La planificación conservará historias de usuario, "
                "entregas pequeñas, diseño simple, estándares de codificación, refactorización, "
                "integración frecuente y pruebas automatizadas. No se considerarán aplicadas la "
                "programación en pareja ni la presencia continua de un cliente mientras no exista "
                "otra persona o una organización que desempeñe esos roles.",
            ),
            make_paragraph(body_reference, ""),
            make_paragraph(methods_heading, "Plan de iteraciones"),
            make_paragraph(
                body_reference,
                "La planificación organiza el producto en cinco incrementos: primero, acceso, "
                "perfiles y permisos; segundo, donantes, bodegas y registro de donaciones; tercero, "
                "inventario por lote y control de vencimientos; cuarto, solicitudes, asignación y "
                "trazabilidad de entrega; y quinto, notificaciones, reportes y verificación "
                "integral. Cada incremento deberá definir criterios de aceptación, pruebas y una "
                "revisión antes de incorporar el siguiente conjunto de funcionalidades.",
            ),
        ]
        for element in new_chapter_three:
            if element.tag == f"{{{W}}}p" and paragraph_text(element) in {
                "Comparación de enfoques ágiles",
                "Plan de iteraciones",
            }:
                set_spacing_before(element, 120)

        elements = list(body)
        old_start = elements.index(old_intro_heading)
        old_end = elements.index(collection_heading)
        for element in elements[old_start:old_end]:
            body.remove(element)
        insert_at = list(body).index(chapter_three) + 1
        for element in new_chapter_three:
            body.insert(insert_at, element)
            insert_at += 1

        elements = list(body)
        move_start = elements.index(collection_heading)
        move_end = elements.index(chapter_four)
        implementation_elements = elements[move_start:move_end]
        for element in implementation_elements:
            body.remove(element)

        moved_heading_numbers = {
            "Recolección y Análisis de Requisitos": "4.1.1 Requisitos y casos de uso implementados",
            "Identificación y Definición de Actores del Sistema": "4.1.1.1 Actores considerados en el prototipo",
            "Matriz de Requerimientos Funcionales (RF)": "4.1.1.2 Matriz de requerimientos funcionales implementados",
            "Matriz de Requerimientos No Funcionales (RNF)": "4.1.1.3 Matriz de requerimientos no funcionales verificados",
            "Diseño de la Arquitectura del Software": "4.1.2 Arquitectura implementada",
            "Estructura General y Diagrama de Bloques": "4.1.2.1 Estructura general y diagrama de bloques",
            "Desglose de las Capas del Sistema": "4.1.2.2 Capas del sistema",
            "Flujos de acceso a datos": "4.1.2.3 Flujos de acceso a datos",
            "Diseño Detallado": "4.1.3 Diseño detallado implementado",
            "Modelo de Datos Multi-Bodega (ERD)": "4.1.3.1 Modelo de datos multi-bodega",
            "Automatización y Auditoría en Base de Datos": "4.1.3.2 Automatización y auditoría en PostgreSQL",
            "Lógica del Módulo de Trazabilidad y Logística": "4.1.4 Módulo de trazabilidad y logística",
            "Secuencia transaccional resumida": "4.1.4.1 Secuencia transaccional resumida",
            "Tecnologías y Herramientas": "4.1.5 Tecnologías y herramientas utilizadas",
            "Entorno de Desarrollo y Lenguaje Base": "4.1.5.1 Entorno de desarrollo y lenguaje base",
            "Ecosistema Frontend (Capa de Presentación)": "4.1.5.2 Ecosistema frontend",
            "Ecosistema Backend y Persistencia (Capa de Datos y Seguridad)": "4.1.5.3 Backend, persistencia y seguridad",
            "Herramientas de Integración y Servicios Externos": "4.1.5.4 Integraciones y servicios externos",
            "Matriz de Resumen del Stack Tecnológico": "4.1.5.5 Resumen del stack tecnológico",
        }
        use_case_heading_count = 0
        for element in implementation_elements:
            clear_highlight(element)
            if element.tag == f"{{{W}}}p":
                current = paragraph_text(element)
                normalized = current.strip()
                if normalized in moved_heading_numbers:
                    replace_paragraph_text(element, moved_heading_numbers[normalized])
                    strip_numbering(element)
                elif normalized == "Especificación Textual Detallada de Casos de Uso Críticos":
                    use_case_heading_count += 1
                    label = (
                        "4.1.1.4 Catálogo de casos de uso implementados"
                        if use_case_heading_count == 1
                        else "4.1.1.5 Especificación de casos de uso críticos"
                    )
                    replace_paragraph_text(element, label)
                    strip_numbering(element)
                elif current.startswith("A partir del levantamiento de información"):
                    replace_paragraph_text(
                        element,
                        "A partir del escenario conceptual y de los flujos simulados se definieron "
                        "cinco actores para comprobar la separación de responsabilidades dentro "
                        "del prototipo. Estos perfiles no corresponden a participantes de una "
                        "organización observada.",
                    )
                elif current.startswith("Los Requerimientos Funcionales definen"):
                    replace_paragraph_text(
                        element,
                        "Los requerimientos funcionales describen los servicios, cálculos y flujos "
                        "que fueron implementados en la plataforma para representar el inventario "
                        "virtual distribuido. La matriz incorpora su estado y la evidencia técnica "
                        "correspondiente.",
                    )
                elif current.startswith("Los Requerimientos No Funcionales establecen"):
                    replace_paragraph_text(
                        element,
                        "Los requerimientos no funcionales resumen las propiedades de calidad y "
                        "restricciones verificadas en la implementación, junto con su sustento "
                        "arquitectónico o evidencia técnica.",
                    )
                elif current.startswith("Tabla 3."):
                    replace_paragraph_text(element, current.replace("Tabla 3.", "Tabla 4.", 1))
                elif current.startswith("Figura 3."):
                    replace_paragraph_text(element, current.replace("Figura 3.", "Figura 4.", 1))

        insert_at = list(body).index(integration_heading)
        for element in implementation_elements:
            body.insert(insert_at, element)
            insert_at += 1

        set_page_break_before(chapter_four)

        # Add the methodological sources to the bibliography.
        paragraphs = body.findall("w:p", NS)
        bermudez_reference = find_paragraph(paragraphs, "Bermúdez Monsalve")
        cordero_reference = find_paragraph(paragraphs, "Cordero-Ahiman")
        spdp_reference = find_paragraph(paragraphs, "Superintendencia de Protección")
        body.insert(
            list(body).index(bermudez_reference),
            make_paragraph(
                bermudez_reference,
                "Beck, K., & Andres, C. (2004). Extreme programming explained: Embrace change "
                "(2nd ed.). Addison-Wesley Professional.",
            ),
        )
        body.insert(
            list(body).index(cordero_reference),
            make_paragraph(
                cordero_reference,
                "Coleman, J., Vacanti, D., Johnson, C., Singh, P., Wester, J., Neverdal, C., "
                "Firlit, M., Gilb, T., & Tendon, S. (2025). The Kanban guide. Kanban Guides.",
            ),
        )
        body.insert(
            list(body).index(spdp_reference),
            make_paragraph(
                spdp_reference,
                "Schwaber, K., & Sutherland, J. (2020). The Scrum guide: The definitive guide "
                "to Scrum. Scrum Guides.",
            ),
        )

        annex_heading = find_paragraph(body.findall("w:p", NS), "Anexos")
        annex_a = make_paragraph(methods_heading, "Anexo A. Protocolo de validación externa del prototipo")
        annex_b = make_paragraph(methods_heading, "Anexo B. Guía de entrevista y prueba con el evaluador")
        for heading in (annex_a, annex_b):
            strip_numbering(heading)
            set_spacing_before(heading, 120)
        annex_elements = [
            annex_a,
            make_paragraph(
                body_reference,
                "Estado: pendiente de aplicación. Fecha: [por completar]. Participante: [nombre o "
                "código y perfil por completar]. Criterio de selección: experiencia en donaciones, "
                "asistencia social, inventarios, logística, distribución alimentaria o gestión "
                "comunitaria. Objetivo: valorar la claridad, pertinencia operativa, utilidad "
                "potencial y facilidad de uso del prototipo. Modalidad: demostración inicial, "
                "ejecución de tareas guiadas, entrevista semiestructurada y registro de "
                "observaciones. La participación deberá ser voluntaria y autorizarse el uso "
                "académico de las respuestas.",
            ),
            annex_b,
            make_paragraph(
                body_reference,
                "Tareas propuestas: registrar una donación simulada; consultar el lote y su "
                "ubicación; crear una solicitud; revisar la asignación; y consultar la trazabilidad "
                "hasta la entrega. Preguntas: (1) ¿El flujo representa una forma comprensible de "
                "coordinar donaciones? (2) ¿Qué información falta para tomar decisiones? (3) "
                "¿Qué pasos resultan confusos o innecesarios? (4) ¿La trazabilidad generaría "
                "confianza y control? (5) ¿En qué contexto podría ser útil el sistema? (6) "
                "¿Qué riesgo impediría utilizarlo? Registro de resultados: tareas completadas, "
                "dificultades observadas, respuestas, sugerencias y conclusión del evaluador sobre "
                "la utilidad potencial. Resultado: [por completar después de la aplicación].",
            ),
        ]
        insert_at = list(body).index(annex_heading) + 1
        for element in annex_elements:
            body.insert(insert_at, element)
            insert_at += 1

        tree.write(document_path, encoding="UTF-8", xml_declaration=True)

        with ZipFile(target, "w", ZIP_DEFLATED) as output:
            for path in sorted(temp.rglob("*")):
                if path.is_file():
                    output.write(path, path.relative_to(temp))

    print(target.resolve())


if __name__ == "__main__":
    main()
