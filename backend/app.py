from io import BytesIO


import os
import re
import ipaddress
import datetime
from functools import wraps
from urllib.parse import urlparse

from flask import Flask, jsonify, request, send_file
from werkzeug.utils import secure_filename
from flask_cors import CORS
from dotenv import load_dotenv

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    Image
)

import mysql.connector
from mysql.connector import Error

import jwt
import bcrypt

# =====================================================
# cargar variables de entorno
# =====================================================

load_dotenv()


# =====================================================
# configuración principal
# =====================================================

app = Flask(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOGO_INAMHI_PATH = os.path.join(BASE_DIR, "static", "img", "logo_inamhi.png")

CORS(app, resources={
    r"/api/*": {
        "origins": [
            "http://localhost:4300",
            "http://127.0.0.1:4300"
        ]
    }
})

app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # 10 mb

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", 3306))
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "inamhi_liberacion_web")

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "inamhi_liberacion_web_secret_2026")
JWT_EXPIRATION_HOURS = int(os.getenv("JWT_EXPIRATION_HOURS", 8))

BACKEND_HOST = os.getenv("BACKEND_HOST", "127.0.0.1")
BACKEND_PORT = int(os.getenv("BACKEND_PORT", 5050))

UPLOAD_FOLDER = "uploads"
DOCUMENTOS_FOLDER = os.path.join(UPLOAD_FOLDER, "documentos")
FIRMADOS_FOLDER = os.path.join(UPLOAD_FOLDER, "firmados")
ESCANEADOS_FOLDER = os.path.join(UPLOAD_FOLDER, "escaneados")


# =====================================================
# crear carpetas necesarias
# =====================================================

def crear_carpetas():
    carpetas = [
        UPLOAD_FOLDER,
        DOCUMENTOS_FOLDER,
        FIRMADOS_FOLDER,
        ESCANEADOS_FOLDER,
        "logs"
    ]

    for carpeta in carpetas:
        if not os.path.exists(carpeta):
            os.makedirs(carpeta)


crear_carpetas()


# =====================================================
# conexión mysql
# =====================================================

def get_db_connection():
    try:
        conexion = mysql.connector.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME
        )

        if conexion.is_connected():
            return conexion

        return None

    except Error as error:
        print("error al conectar con mysql:", error)
        return None


# =====================================================
# utilidades generales
# =====================================================

def limpiar_texto(valor):
    if valor is None:
        return ""
    return str(valor).strip()


def obtener_ip_cliente():
    forwarded_for = request.headers.get("X-Forwarded-For")

    if forwarded_for:
        return forwarded_for.split(",")[0].strip()

    return request.remote_addr


def normalizar_espacios(texto):
    texto = limpiar_texto(texto)
    return re.sub(r"\s+", " ", texto)


def validar_solo_letras_espacios(texto):
    patron = r"^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]+$"
    return re.match(patron, texto) is not None


def validar_correo_general(correo):
    correo = limpiar_texto(correo).lower()

    patron_correo = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"

    return re.match(patron_correo, correo) is not None


def validar_cedula_formato(cedula):
    cedula = limpiar_texto(cedula)
    return cedula.isdigit() and len(cedula) == 10


def validar_telefono_10_digitos(telefono):
    telefono = limpiar_texto(telefono)
    return telefono.isdigit() and len(telefono) == 10


def validar_ipv4(ip):
    ip = limpiar_texto(ip)

    try:
        ipaddress.IPv4Address(ip)
        return True
    except Exception:
        return False


def validar_url(url):
    url = limpiar_texto(url)

    if not url:
        return False

    if " " in url:
        return False

    try:
        resultado = urlparse(url)

        if resultado.scheme not in ["http", "https"]:
            return False

        if not resultado.netloc:
            return False

        return True

    except Exception:
        return False


def validar_fecha(fecha):
    fecha = limpiar_texto(fecha)

    try:
        datetime.datetime.strptime(fecha, "%Y-%m-%d")
        return True
    except ValueError:
        return False


def convertir_fecha(fecha):
    return datetime.datetime.strptime(fecha, "%Y-%m-%d").date()


def generar_codigo_solicitud():
    anio = datetime.datetime.now().year
    prefijo = f"INAMHI-WEB-{anio}-"

    conexion = get_db_connection()

    if conexion is None:
        return None

    try:
        cursor = conexion.cursor(dictionary=True)

        sql = """
            select codigo_solicitud
            from solicitudes
            where codigo_solicitud like %s
            order by id desc
            limit 1;
        """

        cursor.execute(sql, (f"{prefijo}%",))
        ultimo = cursor.fetchone()

        cursor.close()
        conexion.close()

        if ultimo is None:
            numero = 1
        else:
            codigo_actual = ultimo["codigo_solicitud"]
            numero_actual = int(codigo_actual.split("-")[-1])
            numero = numero_actual + 1

        return f"{prefijo}{str(numero).zfill(4)}"

    except Exception as error:
        print("error al generar código:", error)
        return None


def registrar_auditoria(usuario_id, solicitud_id, modulo, accion, descripcion, datos_anteriores=None, datos_nuevos=None):
    conexion = get_db_connection()

    if conexion is None:
        return False

    try:
        cursor = conexion.cursor()

        sql = """
            insert into auditoria (
                usuario_id,
                solicitud_id,
                modulo,
                accion,
                descripcion,
                datos_anteriores,
                datos_nuevos,
                ip_origen
            ) values (
                %s, %s, %s, %s, %s, %s, %s, %s
            );
        """

        import json

        cursor.execute(sql, (
            usuario_id,
            solicitud_id,
            modulo,
            accion,
            descripcion,
            json.dumps(datos_anteriores, ensure_ascii=False) if datos_anteriores else None,
            json.dumps(datos_nuevos, ensure_ascii=False) if datos_nuevos else None,
            obtener_ip_cliente()
        ))

        conexion.commit()
        cursor.close()
        conexion.close()

        return True

    except Error as error:
        print("error al registrar auditoría:", error)
        return False


# =====================================================
# validación fuerte de solicitud pública
# =====================================================

def validar_solicitud_publica(data):
    errores = {}

    nombres_completos = normalizar_espacios(data.get("nombres_completos"))
    cedula = limpiar_texto(data.get("cedula"))
    correo_institucional = limpiar_texto(data.get("correo_institucional")).lower()
    telefono_ext = limpiar_texto(data.get("telefono_ext"))
    dependencia = normalizar_espacios(data.get("dependencia"))
    area_unidad = normalizar_espacios(data.get("area_unidad"))
    cargo = normalizar_espacios(data.get("cargo"))
    fecha_solicitud = limpiar_texto(data.get("fecha_solicitud"))
    tipo_usuario = limpiar_texto(data.get("tipo_usuario"))
    nombre_usuario_externo = normalizar_espacios(data.get("nombre_usuario_externo"))
    direccion_ip = limpiar_texto(data.get("direccion_ip"))
    tiempo_vigencia_acceso = normalizar_espacios(data.get("tiempo_vigencia_acceso"))
    justificacion = normalizar_espacios(data.get("justificacion_necesidad_institucional"))
    paginas_web = data.get("paginas_web")

    # nombres completos
    if not nombres_completos:
        errores["nombres_completos"] = "los nombres completos son obligatorios."
    elif len(nombres_completos) < 5:
        errores["nombres_completos"] = "los nombres completos deben tener mínimo 5 caracteres."
    elif len(nombres_completos) > 200:
        errores["nombres_completos"] = "los nombres completos no pueden superar 200 caracteres."
    elif not validar_solo_letras_espacios(nombres_completos):
        errores["nombres_completos"] = "los nombres completos solo pueden contener letras y espacios."

    # cédula
    if not cedula:
        errores["cedula"] = "la cédula es obligatoria."
    elif not validar_cedula_formato(cedula):
        errores["cedula"] = "la cédula debe contener exactamente 10 números."

  # correo electrónico
    if not correo_institucional:
         errores["correo_institucional"] = "el correo electrónico es obligatorio."
    elif not validar_correo_general(correo_institucional):
        errores["correo_institucional"] = "ingrese un correo válido. ejemplo: usuario@gmail.com, usuario@outlook.com o usuario@inamhi.gob.ec."

    # teléfono
    if not telefono_ext:
        errores["telefono_ext"] = "el teléfono es obligatorio."
    elif not validar_telefono_10_digitos(telefono_ext):
        errores["telefono_ext"] = "el teléfono debe contener exactamente 10 números."

    # dependencia
    if not dependencia:
        errores["dependencia"] = "la dependencia es obligatoria."
    elif len(dependencia) < 3:
        errores["dependencia"] = "la dependencia debe tener mínimo 3 caracteres."
    elif len(dependencia) > 150:
        errores["dependencia"] = "la dependencia no puede superar 150 caracteres."

    # área / unidad
    if not area_unidad:
        errores["area_unidad"] = "el área o unidad es obligatoria."
    elif len(area_unidad) < 3:
        errores["area_unidad"] = "el área o unidad debe tener mínimo 3 caracteres."
    elif len(area_unidad) > 150:
        errores["area_unidad"] = "el área o unidad no puede superar 150 caracteres."

    # cargo
    if not cargo:
        errores["cargo"] = "el cargo es obligatorio."
    elif len(cargo) < 3:
        errores["cargo"] = "el cargo debe tener mínimo 3 caracteres."
    elif len(cargo) > 150:
        errores["cargo"] = "el cargo no puede superar 150 caracteres."

    # fecha
    if not fecha_solicitud:
        errores["fecha_solicitud"] = "la fecha de solicitud es obligatoria."
    elif not validar_fecha(fecha_solicitud):
        errores["fecha_solicitud"] = "la fecha debe tener formato yyyy-mm-dd."

    # tipo usuario
    tipos_validos = ["funcionario_inamhi", "externo"]

    if not tipo_usuario:
        errores["tipo_usuario"] = "el tipo de usuario es obligatorio."
    elif tipo_usuario not in tipos_validos:
        errores["tipo_usuario"] = "el tipo de usuario solo puede ser funcionario_inamhi o externo."

    # externo
    if tipo_usuario == "externo":
        if not nombre_usuario_externo:
            errores["nombre_usuario_externo"] = "el nombre del usuario externo es obligatorio."
        elif len(nombre_usuario_externo) < 5:
            errores["nombre_usuario_externo"] = "el nombre del usuario externo debe tener mínimo 5 caracteres."
        elif len(nombre_usuario_externo) > 200:
            errores["nombre_usuario_externo"] = "el nombre del usuario externo no puede superar 200 caracteres."

        if not direccion_ip:
            errores["direccion_ip"] = "la dirección ip es obligatoria para usuario externo."
        elif not validar_ipv4(direccion_ip):
            errores["direccion_ip"] = "la dirección ip debe tener formato ipv4 válido."

    if tipo_usuario == "funcionario_inamhi":
        if direccion_ip and not validar_ipv4(direccion_ip):
            errores["direccion_ip"] = "la dirección ip debe tener formato ipv4 válido."

    # vigencia
    if not tiempo_vigencia_acceso:
        errores["tiempo_vigencia_acceso"] = "el tiempo de vigencia del acceso es obligatorio."
    elif len(tiempo_vigencia_acceso) < 3:
        errores["tiempo_vigencia_acceso"] = "el tiempo de vigencia debe tener mínimo 3 caracteres."
    elif len(tiempo_vigencia_acceso) > 100:
        errores["tiempo_vigencia_acceso"] = "el tiempo de vigencia no puede superar 100 caracteres."

    # justificación
    if not justificacion:
        errores["justificacion_necesidad_institucional"] = "la justificación es obligatoria."
    elif len(justificacion) < 20:
        errores["justificacion_necesidad_institucional"] = "la justificación debe tener mínimo 20 caracteres."
    elif len(justificacion) > 2000:
        errores["justificacion_necesidad_institucional"] = "la justificación no puede superar 2000 caracteres."

    # páginas web
    if not isinstance(paginas_web, list):
        errores["paginas_web"] = "las páginas web deben enviarse como una lista."
    else:
        paginas_limpias = []

        for pagina in paginas_web:
            if isinstance(pagina, dict):
                url = limpiar_texto(pagina.get("url_pagina"))
                descripcion = normalizar_espacios(pagina.get("descripcion"))
            else:
                url = limpiar_texto(pagina)
                descripcion = ""

            if url:
                paginas_limpias.append({
                    "url_pagina": url,
                    "descripcion": descripcion
                })

        if len(paginas_limpias) < 1:
            errores["paginas_web"] = "debe ingresar al menos una página web importante."
        elif len(paginas_limpias) > 8:
            errores["paginas_web"] = "solo se permiten máximo 8 páginas web."
        else:
            for index, pagina in enumerate(paginas_limpias, start=1):
                if len(pagina["url_pagina"]) > 255:
                    errores[f"pagina_{index}"] = "la url no puede superar 255 caracteres."
                elif not validar_url(pagina["url_pagina"]):
                    errores[f"pagina_{index}"] = "la url debe ser válida e iniciar con http:// o https://."

                if len(pagina["descripcion"]) > 255:
                    errores[f"descripcion_pagina_{index}"] = "la descripción de la página no puede superar 255 caracteres."

    datos_limpios = {
        "nombres_completos": nombres_completos,
        "cedula": cedula,
        "correo_institucional": correo_institucional,
        "telefono_ext": telefono_ext,
        "dependencia": dependencia,
        "area_unidad": area_unidad,
        "cargo": cargo,
        "fecha_solicitud": fecha_solicitud,
        "tipo_usuario": tipo_usuario,
        "nombre_usuario_externo": nombre_usuario_externo if tipo_usuario == "externo" else None,
        "direccion_ip": direccion_ip if direccion_ip else None,
        "tiempo_vigencia_acceso": tiempo_vigencia_acceso,
        "justificacion_necesidad_institucional": justificacion,
        "paginas_web": []
    }

    if isinstance(paginas_web, list):
        for pagina in paginas_web:
            if isinstance(pagina, dict):
                url = limpiar_texto(pagina.get("url_pagina"))
                descripcion = normalizar_espacios(pagina.get("descripcion"))
            else:
                url = limpiar_texto(pagina)
                descripcion = ""

            if url:
                datos_limpios["paginas_web"].append({
                    "url_pagina": url,
                    "descripcion": descripcion
                })

    return errores, datos_limpios


# =====================================================
# utilidades de seguridad
# =====================================================

def crear_hash_password(password):
    password_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt()
    hash_generado = bcrypt.hashpw(password_bytes, salt)
    return hash_generado.decode("utf-8")


def verificar_password(password_plano, password_hash):
    try:
        return bcrypt.checkpw(
            password_plano.encode("utf-8"),
            password_hash.encode("utf-8")
        )
    except Exception:
        return False


def generar_token(usuario):
    expiracion = datetime.datetime.utcnow() + datetime.timedelta(hours=JWT_EXPIRATION_HOURS)

    payload = {
        "id": usuario["id"],
        "usuario": usuario["usuario"],
        "correo": usuario["correo"],
        "rol": usuario["rol"],
        "exp": expiracion
    }

    token = jwt.encode(payload, JWT_SECRET_KEY, algorithm="HS256")

    return token


def decodificar_token(token):
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=["HS256"])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


# =====================================================
# middlewares / decoradores
# =====================================================

def token_requerido(f):
    @wraps(f)
    def decorador(*args, **kwargs):
        auth_header = request.headers.get("Authorization")

        if not auth_header:
            return jsonify({
                "estado": "error",
                "mensaje": "token no proporcionado"
            }), 401

        try:
            partes = auth_header.split(" ")

            if len(partes) != 2 or partes[0] != "Bearer":
                return jsonify({
                    "estado": "error",
                    "mensaje": "formato de token inválido"
                }), 401

            token = partes[1]
            payload = decodificar_token(token)

            if payload is None:
                return jsonify({
                    "estado": "error",
                    "mensaje": "token inválido o expirado"
                }), 401

            request.usuario_actual = payload

        except Exception as error:
            return jsonify({
                "estado": "error",
                "mensaje": "error al validar token",
                "error": str(error)
            }), 401

        return f(*args, **kwargs)

    return decorador


def roles_permitidos(*roles):
    def wrapper(f):
        @wraps(f)
        def decorador(*args, **kwargs):
            usuario_actual = getattr(request, "usuario_actual", None)

            if usuario_actual is None:
                return jsonify({
                    "estado": "error",
                    "mensaje": "usuario no autenticado"
                }), 401

            if usuario_actual["rol"] not in roles:
                return jsonify({
                    "estado": "error",
                    "mensaje": "no tiene permisos para acceder a este recurso",
                    "rol_actual": usuario_actual["rol"],
                    "roles_permitidos": roles
                }), 403

            return f(*args, **kwargs)

        return decorador

    return wrapper


# =====================================================
# funciones de usuario
# =====================================================

def obtener_usuario_por_username(username):
    conexion = get_db_connection()

    if conexion is None:
        return None

    try:
        cursor = conexion.cursor(dictionary=True)

        sql = """
            select 
                u.id,
                u.rol_id,
                r.nombre as rol,
                u.nombres,
                u.apellidos,
                u.cedula,
                u.correo,
                u.usuario,
                u.password_hash,
                u.cargo,
                u.area_unidad,
                u.dependencia,
                u.telefono_ext,
                u.estado
            from usuarios u
            inner join roles r on r.id = u.rol_id
            where u.usuario = %s
            limit 1;
        """

        cursor.execute(sql, (username,))
        usuario = cursor.fetchone()

        cursor.close()
        conexion.close()

        return usuario

    except Error as error:
        print("error al obtener usuario:", error)
        return None


def obtener_usuario_por_id(usuario_id):
    conexion = get_db_connection()

    if conexion is None:
        return None

    try:
        cursor = conexion.cursor(dictionary=True)

        sql = """
            select 
                u.id,
                u.rol_id,
                r.nombre as rol,
                u.nombres,
                u.apellidos,
                u.cedula,
                u.correo,
                u.usuario,
                u.cargo,
                u.area_unidad,
                u.dependencia,
                u.telefono_ext,
                u.estado,
                u.ultimo_acceso,
                u.created_at,
                u.updated_at
            from usuarios u
            inner join roles r on r.id = u.rol_id
            where u.id = %s
            limit 1;
        """

        cursor.execute(sql, (usuario_id,))
        usuario = cursor.fetchone()

        cursor.close()
        conexion.close()

        return usuario

    except Error as error:
        print("error al obtener usuario por id:", error)
        return None


def actualizar_ultimo_acceso(usuario_id):
    conexion = get_db_connection()

    if conexion is None:
        return False

    try:
        cursor = conexion.cursor()

        sql = """
            update usuarios
            set ultimo_acceso = now()
            where id = %s;
        """

        cursor.execute(sql, (usuario_id,))
        conexion.commit()

        cursor.close()
        conexion.close()

        return True

    except Error as error:
        print("error al actualizar último acceso:", error)
        return False


# =====================================================
# rutas de prueba
# =====================================================

@app.route("/", methods=["GET"])
def inicio():
    return jsonify({
        "estado": "ok",
        "mensaje": "backend inamhi liberación web funcionando correctamente",
        "puerto": BACKEND_PORT
    }), 200


@app.route("/api/test", methods=["GET"])
def test():
    return jsonify({
        "estado": "ok",
        "mensaje": "backend del sistema de liberacion web inamhi funcionando correctamente",
        "sistema": "sistema de gestion de solicitudes de liberacion web",
        "institucion": "inamhi",
        "version": "1.0.0",
        "backend_url": f"http://{BACKEND_HOST}:{BACKEND_PORT}"
    }), 200


@app.route("/api/test-db", methods=["GET"])
def test_db():
    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos mysql",
            "base_datos": DB_NAME,
            "host": DB_HOST,
            "puerto": DB_PORT,
            "usuario": DB_USER
        }), 500

    try:
        cursor = conexion.cursor(dictionary=True)

        cursor.execute("select database() as base_datos;")
        base = cursor.fetchone()

        cursor.execute("show tables;")
        tablas = cursor.fetchall()

        cursor.close()
        conexion.close()

        return jsonify({
            "estado": "ok",
            "mensaje": "conexión exitosa con mysql",
            "base_datos": base["base_datos"],
            "tablas": tablas
        }), 200

    except Error as error:
        return jsonify({
            "estado": "error",
            "mensaje": "error al consultar la base de datos",
            "error": str(error)
        }), 500


# =====================================================
# solicitud pública
# =====================================================

@app.route("/api/public/solicitudes", methods=["POST"])
def registrar_solicitud_publica():
    data = request.get_json()

    if not data:
        return jsonify({
            "estado": "error",
            "mensaje": "no se recibieron datos para registrar la solicitud."
        }), 400

    errores, datos = validar_solicitud_publica(data)

    if errores:
        return jsonify({
            "estado": "error",
            "mensaje": "existen errores de validación en el formulario.",
            "errores": errores
        }), 400

    codigo_solicitud = generar_codigo_solicitud()

    if codigo_solicitud is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo generar el código de solicitud."
        }), 500

    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor()

        sql_solicitud = """
            insert into solicitudes (
                codigo_solicitud,
                nombres_completos,
                cedula,
                correo_institucional,
                telefono_ext,
                dependencia,
                area_unidad,
                cargo,
                fecha_solicitud,
                tipo_usuario,
                nombre_usuario_externo,
                direccion_ip,
                tiempo_vigencia_acceso,
                justificacion_necesidad_institucional,
                estado,
                etapa_actual,
                bloqueada
            ) values (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                'pendiente_firma_solicitante',
                'firma_solicitante',
                false
            );
        """

        valores_solicitud = (
            codigo_solicitud,
            datos["nombres_completos"],
            datos["cedula"],
            datos["correo_institucional"],
            datos["telefono_ext"],
            datos["dependencia"],
            datos["area_unidad"],
            datos["cargo"],
            convertir_fecha(datos["fecha_solicitud"]),
            datos["tipo_usuario"],
            datos["nombre_usuario_externo"],
            datos["direccion_ip"],
            datos["tiempo_vigencia_acceso"],
            datos["justificacion_necesidad_institucional"]
        )

        cursor.execute(sql_solicitud, valores_solicitud)
        solicitud_id = cursor.lastrowid

        sql_pagina = """
            insert into solicitud_paginas_web (
                solicitud_id,
                numero,
                url_pagina,
                descripcion
            ) values (
                %s, %s, %s, %s
            );
        """

        for index, pagina in enumerate(datos["paginas_web"], start=1):
            cursor.execute(sql_pagina, (
                solicitud_id,
                index,
                pagina["url_pagina"],
                pagina["descripcion"]
            ))

        conexion.commit()

        cursor.close()
        conexion.close()

        registrar_auditoria(
            usuario_id=None,
            solicitud_id=solicitud_id,
            modulo="solicitud_publica",
            accion="crear_solicitud",
            descripcion=f"solicitud pública creada con código {codigo_solicitud}",
            datos_anteriores=None,
            datos_nuevos={
                "codigo_solicitud": codigo_solicitud,
                "nombres_completos": datos["nombres_completos"],
                "cedula": datos["cedula"],
                "correo_institucional": datos["correo_institucional"],
                "estado": "pendiente_firma_solicitante",
                "etapa_actual": "firma_solicitante"
            }
        )

        return jsonify({
            "estado": "ok",
            "mensaje": "solicitud registrada correctamente.",
            "solicitud": {
                "id": solicitud_id,
                "codigo_solicitud": codigo_solicitud,
                "estado": "pendiente_firma_solicitante",
                "etapa_actual": "firma_solicitante",
                "nombres_completos": datos["nombres_completos"],
                "correo_institucional": datos["correo_institucional"]
            }
        }), 201

    except Error as error:
        conexion.rollback()

        return jsonify({
            "estado": "error",
            "mensaje": "error al registrar la solicitud.",
            "error": str(error)
        }), 500


@app.route("/api/public/solicitudes/seguimiento/<codigo>", methods=["GET"])
def seguimiento_solicitud_publica(codigo):
    codigo = limpiar_texto(codigo).upper()

    if not codigo:
        return jsonify({
            "estado": "error",
            "mensaje": "el código de solicitud es obligatorio."
        }), 400

    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor(dictionary=True)

        sql = """
            select
                id,
                codigo_solicitud,
                nombres_completos,
                cedula,
                correo_institucional,
                dependencia,
                area_unidad,
                cargo,
                fecha_solicitud,
                tipo_usuario,
                tiempo_vigencia_acceso,
                justificacion_necesidad_institucional,
                estado,
                etapa_actual,
                bloqueada,
                created_at,
                updated_at
            from solicitudes
            where codigo_solicitud = %s
            limit 1;
        """

        cursor.execute(sql, (codigo,))
        solicitud = cursor.fetchone()

        if solicitud is None:
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "no se encontró una solicitud con ese código."
            }), 404

        sql_paginas = """
            select numero, url_pagina, descripcion
            from solicitud_paginas_web
            where solicitud_id = %s
            order by numero asc;
        """

        cursor.execute(sql_paginas, (solicitud["id"],))
        paginas = cursor.fetchall()

        cursor.close()
        conexion.close()

        return jsonify({
            "estado": "ok",
            "solicitud": solicitud,
            "paginas_web": paginas
        }), 200

    except Error as error:
        return jsonify({
            "estado": "error",
            "mensaje": "error al consultar la solicitud.",
            "error": str(error)
        }), 500


# =====================================================
# ruta temporal para generar contraseñas reales
# eliminar o comentar después de usar
# =====================================================

@app.route("/api/dev/reset-passwords", methods=["GET"])
def reset_passwords():
    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con mysql"
        }), 500

    usuarios_passwords = [
        ("admin", "admin123"),
        ("jefe", "jefe123"),
        ("autoridad", "autoridad123"),
        ("tics", "tics123")
    ]

    try:
        cursor = conexion.cursor()

        for username, password in usuarios_passwords:
            password_hash = crear_hash_password(password)

            sql = """
                update usuarios
                set password_hash = %s
                where usuario = %s;
            """

            cursor.execute(sql, (password_hash, username))

        conexion.commit()

        cursor.close()
        conexion.close()

        return jsonify({
            "estado": "ok",
            "mensaje": "contraseñas actualizadas correctamente",
            "usuarios": [
                {
                    "usuario": "admin",
                    "password": "admin123"
                },
                {
                    "usuario": "jefe",
                    "password": "jefe123"
                },
                {
                    "usuario": "autoridad",
                    "password": "autoridad123"
                },
                {
                    "usuario": "tics",
                    "password": "tics123"
                }
            ],
            "advertencia": "esta ruta es temporal. después de usarla, se recomienda comentarla o eliminarla."
        }), 200

    except Error as error:
        return jsonify({
            "estado": "error",
            "mensaje": "error al actualizar contraseñas",
            "error": str(error)
        }), 500


# =====================================================
# autenticación
# =====================================================

@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json()

    if not data:
        return jsonify({
            "estado": "error",
            "mensaje": "no se recibieron datos"
        }), 400

    username = limpiar_texto(data.get("usuario"))
    password = limpiar_texto(data.get("password"))

    if not username or not password:
        return jsonify({
            "estado": "error",
            "mensaje": "usuario y contraseña son obligatorios"
        }), 400

    usuario = obtener_usuario_por_username(username)

    if usuario is None:
        return jsonify({
            "estado": "error",
            "mensaje": "usuario o contraseña incorrectos"
        }), 401

    if usuario["estado"] != "activo":
        return jsonify({
            "estado": "error",
            "mensaje": "usuario inactivo. comuníquese con el administrador."
        }), 403

    password_correcto = verificar_password(password, usuario["password_hash"])

    if not password_correcto:
        return jsonify({
            "estado": "error",
            "mensaje": "usuario o contraseña incorrectos"
        }), 401

    token = generar_token(usuario)
    actualizar_ultimo_acceso(usuario["id"])

    return jsonify({
        "estado": "ok",
        "mensaje": "inicio de sesión exitoso",
        "token": token,
        "usuario": {
            "id": usuario["id"],
            "nombres": usuario["nombres"],
            "apellidos": usuario["apellidos"],
            "cedula": usuario["cedula"],
            "correo": usuario["correo"],
            "usuario": usuario["usuario"],
            "cargo": usuario["cargo"],
            "area_unidad": usuario["area_unidad"],
            "dependencia": usuario["dependencia"],
            "telefono_ext": usuario["telefono_ext"],
            "rol": usuario["rol"]
        }
    }), 200


@app.route("/api/auth/me", methods=["GET"])
@token_requerido
def auth_me():
    usuario_actual = request.usuario_actual
    usuario = obtener_usuario_por_id(usuario_actual["id"])

    if usuario is None:
        return jsonify({
            "estado": "error",
            "mensaje": "usuario no encontrado"
        }), 404

    return jsonify({
        "estado": "ok",
        "usuario": usuario
    }), 200


@app.route("/api/admin/test", methods=["GET"])
@token_requerido
@roles_permitidos("administrador")
def admin_test():
    return jsonify({
        "estado": "ok",
        "mensaje": "acceso permitido solo para administrador",
        "usuario": request.usuario_actual
    }), 200


@app.route("/api/tics/test", methods=["GET"])
@token_requerido
@roles_permitidos("administrador", "analista_tics")
def tics_test():
    return jsonify({
        "estado": "ok",
        "mensaje": "acceso permitido para administrador o analista tics",
        "usuario": request.usuario_actual
    }), 200
# =====================================================
# solicitudes asignadas por rol
# =====================================================

@app.route("/api/mis-solicitudes", methods=["GET"])
@token_requerido
@roles_permitidos("administrador", "jefe_inmediato", "maxima_autoridad", "analista_tics")
def listar_mis_solicitudes():
    usuario_actual = request.usuario_actual
    rol_actual = usuario_actual["rol"]

    busqueda = limpiar_texto(request.args.get("q"))

    estados_por_rol = {
        "administrador": [
            "pendiente_firma_solicitante",
            "pendiente_jefe_inmediato",
            "pendiente_maxima_autoridad",
            "pendiente_tics",
            "pendiente_ejecucion_tics",
            "finalizada",
            "rechazada_jefe_inmediato",
            "rechazada_maxima_autoridad",
            "rechazada_tics",
            "anulada"
        ],
        "jefe_inmediato": [
            "pendiente_jefe_inmediato"
        ],
        "maxima_autoridad": [
            "pendiente_maxima_autoridad"
        ],
        "analista_tics": [
            "pendiente_tics",
            "pendiente_ejecucion_tics"
        ]
    }

    estados_permitidos = estados_por_rol.get(rol_actual, [])

    if not estados_permitidos:
        return jsonify({
            "estado": "error",
            "mensaje": "el rol actual no tiene solicitudes asignadas.",
            "rol": rol_actual
        }), 403

    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor(dictionary=True)

        placeholders = ", ".join(["%s"] * len(estados_permitidos))
        parametros = list(estados_permitidos)

        condiciones_busqueda = ""

        if busqueda:
            condiciones_busqueda = """
                and (
                    s.codigo_solicitud like %s or
                    s.nombres_completos like %s or
                    s.cedula like %s or
                    s.correo_institucional like %s or
                    s.area_unidad like %s or
                    s.dependencia like %s
                )
            """

            valor_busqueda = f"%{busqueda}%"

            parametros.extend([
                valor_busqueda,
                valor_busqueda,
                valor_busqueda,
                valor_busqueda,
                valor_busqueda,
                valor_busqueda
            ])

        sql = f"""
            select
                s.id,
                s.codigo_solicitud,
                s.nombres_completos,
                s.cedula,
                s.correo_institucional,
                s.telefono_ext,
                s.dependencia,
                s.area_unidad,
                s.cargo,
                s.fecha_solicitud,
                s.tipo_usuario,
                s.nombre_usuario_externo,
                s.direccion_ip,
                s.tiempo_vigencia_acceso,
                s.justificacion_necesidad_institucional,
                s.estado,
                s.etapa_actual,
                s.bloqueada,
                s.created_at,
                s.updated_at,
                count(p.id) as total_paginas
            from solicitudes s
            left join solicitud_paginas_web p on p.solicitud_id = s.id
            where s.estado in ({placeholders})
            {condiciones_busqueda}
            group by s.id
            order by s.id desc;
        """

        cursor.execute(sql, tuple(parametros))
        solicitudes = cursor.fetchall()

        for solicitud in solicitudes:
            solicitud["fecha_solicitud"] = serializar_fecha(solicitud["fecha_solicitud"])
            solicitud["created_at"] = serializar_fecha(solicitud["created_at"])
            solicitud["updated_at"] = serializar_fecha(solicitud["updated_at"])

        cursor.close()
        conexion.close()

        return jsonify({
            "estado": "ok",
            "mensaje": "solicitudes asignadas obtenidas correctamente.",
            "rol": rol_actual,
            "total": len(solicitudes),
            "solicitudes": solicitudes
        }), 200

    except Error as error:
        return jsonify({
            "estado": "error",
            "mensaje": "error al obtener solicitudes asignadas.",
            "error": str(error)
        }), 500
# =====================================================
# solicitudes administrativas
# =====================================================

def serializar_fecha(valor):
    if valor is None:
        return None

    if isinstance(valor, (datetime.datetime, datetime.date)):
        return valor.strftime("%Y-%m-%d %H:%M:%S")

    return str(valor)


@app.route("/api/admin/solicitudes", methods=["GET"])
@token_requerido
@roles_permitidos("administrador", "analista_tics", "jefe_inmediato", "maxima_autoridad")
def listar_solicitudes_admin():
    estado = limpiar_texto(request.args.get("estado"))
    busqueda = limpiar_texto(request.args.get("q"))

    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor(dictionary=True)

        condiciones = []
        parametros = []

        if estado:
            condiciones.append("s.estado = %s")
            parametros.append(estado)

        if busqueda:
            condiciones.append("""
                (
                    s.codigo_solicitud like %s or
                    s.nombres_completos like %s or
                    s.cedula like %s or
                    s.correo_institucional like %s or
                    s.area_unidad like %s or
                    s.dependencia like %s
                )
            """)

            valor_busqueda = f"%{busqueda}%"
            parametros.extend([
                valor_busqueda,
                valor_busqueda,
                valor_busqueda,
                valor_busqueda,
                valor_busqueda,
                valor_busqueda
            ])

        where_sql = ""

        if condiciones:
            where_sql = "where " + " and ".join(condiciones)

        sql = f"""
            select
                s.id,
                s.codigo_solicitud,
                s.nombres_completos,
                s.cedula,
                s.correo_institucional,
                s.telefono_ext,
                s.dependencia,
                s.area_unidad,
                s.cargo,
                s.fecha_solicitud,
                s.tipo_usuario,
                s.nombre_usuario_externo,
                s.direccion_ip,
                s.tiempo_vigencia_acceso,
                s.justificacion_necesidad_institucional,
                s.estado,
                s.etapa_actual,
                s.bloqueada,
                s.created_at,
                s.updated_at,
                count(p.id) as total_paginas
            from solicitudes s
            left join solicitud_paginas_web p on p.solicitud_id = s.id
            {where_sql}
            group by s.id
            order by s.id desc;
        """

        cursor.execute(sql, tuple(parametros))
        solicitudes = cursor.fetchall()

        for solicitud in solicitudes:
            solicitud["fecha_solicitud"] = serializar_fecha(solicitud["fecha_solicitud"])
            solicitud["created_at"] = serializar_fecha(solicitud["created_at"])
            solicitud["updated_at"] = serializar_fecha(solicitud["updated_at"])

        cursor.close()
        conexion.close()

        return jsonify({
            "estado": "ok",
            "mensaje": "solicitudes obtenidas correctamente.",
            "total": len(solicitudes),
            "solicitudes": solicitudes
        }), 200

    except Error as error:
        return jsonify({
            "estado": "error",
            "mensaje": "error al obtener solicitudes.",
            "error": str(error)
        }), 500


# =====================================================
# generación de PDF A4 de solicitud
# =====================================================

def obtener_solicitud_completa_para_pdf(solicitud_id):
    conexion = get_db_connection()

    if conexion is None:
        return None, [], "no se pudo conectar con la base de datos."

    try:
        cursor = conexion.cursor(dictionary=True)

        sql_solicitud = """
            select
                id,
                codigo_solicitud,
                nombres_completos,
                cedula,
                correo_institucional,
                telefono_ext,
                dependencia,
                area_unidad,
                cargo,
                fecha_solicitud,
                tipo_usuario,
                nombre_usuario_externo,
                direccion_ip,
                tiempo_vigencia_acceso,
                justificacion_necesidad_institucional,
                estado,
                etapa_actual,
                bloqueada,
                created_at,
                updated_at
            from solicitudes
            where id = %s
            limit 1;
        """

        cursor.execute(sql_solicitud, (solicitud_id,))
        solicitud = cursor.fetchone()

        if solicitud is None:
            cursor.close()
            conexion.close()
            return None, [], "solicitud no encontrada."

        sql_paginas = """
            select
                numero,
                url_pagina,
                descripcion
            from solicitud_paginas_web
            where solicitud_id = %s
            order by numero asc;
        """

        cursor.execute(sql_paginas, (solicitud_id,))
        paginas_web = cursor.fetchall()

        cursor.close()
        conexion.close()

        return solicitud, paginas_web, None

    except Error as error:
        return None, [], str(error)


def texto_seguro(valor):
    if valor is None:
        return ""

    texto = str(valor)
    texto = texto.replace("&", "&amp;")
    texto = texto.replace("<", "&lt;")
    texto = texto.replace(">", "&gt;")
    return texto


def estado_legible_pdf(estado):
    estados = {
        "pendiente_firma_solicitante": "Pendiente firma solicitante",
        "pendiente_jefe_inmediato": "Pendiente jefe inmediato",
        "rechazada_jefe_inmediato": "Rechazada jefe inmediato",
        "pendiente_maxima_autoridad": "Pendiente máxima autoridad",
        "rechazada_maxima_autoridad": "Rechazada máxima autoridad",
        "pendiente_tics": "Pendiente validación TICS",
        "rechazada_tics": "Rechazada TICS",
        "pendiente_ejecucion_tics": "Pendiente ejecución TICS",
        "finalizada": "Finalizada",
        "anulada": "Anulada"
    }

    return estados.get(estado, estado)


def etapa_legible_pdf(etapa):
    etapas = {
        "registro_publico": "Registro público",
        "firma_solicitante": "Firma del solicitante",
        "jefe_inmediato": "Jefe inmediato",
        "maxima_autoridad": "Máxima autoridad",
        "tics": "Validación TICS",
        "ejecucion_tics": "Ejecución TICS",
        "finalizado": "Finalizado"
    }

    return etapas.get(etapa, etapa)


def agregar_titulo_seccion(elementos, titulo, estilos):
    tabla = Table(
        [[Paragraph(f"<b>{titulo}</b>", estilos["section_title"])]],
        colWidths=[17.4 * cm],
        rowHeights=[0.55 * cm]
    )

    tabla.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#dbeafe")),
        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#1e3a8a")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))

    elementos.append(tabla)


def agregar_espacios_firmas(elementos, estilos):
    agregar_titulo_seccion(
        elementos,
        "5. FIRMAS DE RESPONSABILIDAD Y APROBACIÓN",
        estilos
    )

    data = [
        [
            Paragraph("<b>SOLICITANTE</b>", estilos["center_bold"]),
            Paragraph("<b>JEFE INMEDIATO</b>", estilos["center_bold"]),
            Paragraph("<b>MÁXIMA AUTORIDAD</b>", estilos["center_bold"]),
            Paragraph("<b>TICS</b>", estilos["center_bold"])
        ],
        [
            Paragraph("<br/><br/>_________________________<br/>Nombre / Firma", estilos["center"]),
            Paragraph("<br/><br/>_________________________<br/>Nombre / Firma", estilos["center"]),
            Paragraph("<br/><br/>_________________________<br/>Nombre / Firma", estilos["center"]),
            Paragraph("<br/><br/>_________________________<br/>Nombre / Firma", estilos["center"])
        ]
    ]

    tabla = Table(
        data,
        colWidths=[4.35 * cm, 4.35 * cm, 4.35 * cm, 4.35 * cm],
        rowHeights=[0.58 * cm, 1.75 * cm]
    )

    tabla.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#111827")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#374151")),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eff6ff")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))

    elementos.append(tabla)
    elementos.append(Spacer(1, 0.22 * cm))


def agregar_seccion_tics_vertical_compacta(elementos, estilos):
    titulo = Table(
        [[
            Paragraph("<b>6</b>", estilos["number_box"]),
            Paragraph(
                "<b>PARA USO EXCLUSIVO DE LA UNIDAD DE TICS</b><br/>"
                "<font size='7'>GESTIÓN DE SEGURIDAD DE TIC'S</font>",
                estilos["center_bold"]
            )
        ]],
        colWidths=[1.2 * cm, 16.2 * cm],
        rowHeights=[0.85 * cm]
    )

    titulo.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#111827")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#374151")),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#d1d5db")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))

    elementos.append(titulo)

    autorizacion = Table(
        [[
            Paragraph("<b>AUTORIZACIÓN:</b>", estilos["mini_bold"]),
            Paragraph("Campo validado por TICS", estilos["mini"]),
            Paragraph("☐ Aprobar", estilos["mini"]),
            Paragraph("☐ Rechazar", estilos["mini"])
        ]],
        colWidths=[3.2 * cm, 6.2 * cm, 4 * cm, 4 * cm],
        rowHeights=[0.70 * cm]
    )

    autorizacion.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#111827")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#374151")),
        ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#f3f4f6")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))

    elementos.append(autorizacion)

    observacion = Table(
        [[
            Paragraph("<b>OBSERVACIÓN:</b>", estilos["mini_bold"]),
            Paragraph("", estilos["mini"])
        ]],
        colWidths=[3.2 * cm, 14.2 * cm],
        rowHeights=[1.15 * cm]
    )

    observacion.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#111827")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#374151")),
        ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#f3f4f6")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))

    elementos.append(observacion)

    firmas_tics = Table(
        [[
            Paragraph("Nombre: _______________________<br/><b>Coordinador TICS</b>", estilos["center"]),
            Paragraph("Fecha: _______________________<br/><b>Responsable ejecución</b>", estilos["center"]),
            Paragraph("Nombre: _______________________<br/><b>Admin Firewall INAMHI</b>", estilos["center"])
        ]],
        colWidths=[5.8 * cm, 5.8 * cm, 5.8 * cm],
        rowHeights=[1.45 * cm]
    )

    firmas_tics.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#111827")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#374151")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))

    elementos.append(firmas_tics)

    nota = Paragraph(
        "<b>Nota:</b> Documento de uso institucional. Debe conservarse con las firmas y validaciones correspondientes.",
        estilos["mini"]
    )

    elementos.append(Spacer(1, 0.12 * cm))
    elementos.append(nota)


def generar_pdf_solicitud_a4(solicitud, paginas_web, incluir_seccion_tics=False):
    buffer = BytesIO()

    documento = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=0.85 * cm,
        leftMargin=0.85 * cm,
        topMargin=0.75 * cm,
        bottomMargin=0.75 * cm
    )

    styles = getSampleStyleSheet()

    estilos = {
        "title": ParagraphStyle(
            "title",
            parent=styles["Title"],
            fontName="Helvetica-Bold",
            fontSize=12,
            leading=14,
            alignment=1,
            textColor=colors.HexColor("#111827")
        ),
        "subtitle": ParagraphStyle(
            "subtitle",
            parent=styles["Normal"],
            fontSize=7.5,
            leading=9,
            alignment=1,
            textColor=colors.HexColor("#475569")
        ),
        "section_title": ParagraphStyle(
            "section_title",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            alignment=1,
            textColor=colors.HexColor("#0f172a")
        ),
        "cell_label": ParagraphStyle(
            "cell_label",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=7,
            leading=8.5,
            textColor=colors.HexColor("#0f172a")
        ),
        "cell_text": ParagraphStyle(
            "cell_text",
            parent=styles["Normal"],
            fontSize=7,
            leading=8.5,
            textColor=colors.HexColor("#111827")
        ),
        "mini": ParagraphStyle(
            "mini",
            parent=styles["Normal"],
            fontSize=6.4,
            leading=7.4,
            textColor=colors.HexColor("#111827")
        ),
        "mini_bold": ParagraphStyle(
            "mini_bold",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=6.4,
            leading=7.4,
            textColor=colors.HexColor("#111827")
        ),
        "center": ParagraphStyle(
            "center",
            parent=styles["Normal"],
            fontSize=6.7,
            leading=8,
            alignment=1,
            textColor=colors.HexColor("#111827")
        ),
        "center_bold": ParagraphStyle(
            "center_bold",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=6.8,
            leading=8.2,
            alignment=1,
            textColor=colors.HexColor("#111827")
        ),
        "number_box": ParagraphStyle(
            "number_box",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=11,
            leading=12,
            alignment=1
        )
    }

    elementos = []

    # =====================================================
    # encabezado con logo
    # =====================================================

    if os.path.exists(LOGO_INAMHI_PATH):
        logo = Image(LOGO_INAMHI_PATH, width=1.8 * cm, height=1.8 * cm)
    else:
        logo = Paragraph("<b>INAMHI</b>", estilos["center_bold"])

    encabezado = Table(
        [[
            logo,
            Paragraph("<b>SOLICITUD DE LIBERACIÓN WEB INSTITUCIONAL</b>", estilos["title"]),
            Paragraph(
                f"<b>Código:</b><br/>{texto_seguro(solicitud['codigo_solicitud'])}",
                estilos["subtitle"]
            )
        ]],
        colWidths=[2.6 * cm, 10.8 * cm, 4.0 * cm],
        rowHeights=[1.9 * cm]
    )

    encabezado.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.9, colors.HexColor("#111827")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#374151")),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#eaf2fb")),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))

    elementos.append(encabezado)
    elementos.append(Spacer(1, 0.22 * cm))

    # =====================================================
    # 1. datos del solicitante
    # =====================================================

    agregar_titulo_seccion(elementos, "1. DATOS DEL SOLICITANTE", estilos)

    datos_solicitante = [
        [
            Paragraph("<b>Nombres</b>", estilos["cell_label"]),
            Paragraph(texto_seguro(solicitud["nombres_completos"])[:90], estilos["cell_text"]),
            Paragraph("<b>Cédula</b>", estilos["cell_label"]),
            Paragraph(texto_seguro(solicitud["cedula"]), estilos["cell_text"]),
        ],
        [
            Paragraph("<b>Correo</b>", estilos["cell_label"]),
            Paragraph(texto_seguro(solicitud["correo_institucional"])[:80], estilos["cell_text"]),
            Paragraph("<b>Teléfono</b>", estilos["cell_label"]),
            Paragraph(texto_seguro(solicitud["telefono_ext"]), estilos["cell_text"]),
        ],
        [
            Paragraph("<b>Dependencia</b>", estilos["cell_label"]),
            Paragraph(texto_seguro(solicitud["dependencia"])[:80], estilos["cell_text"]),
            Paragraph("<b>Área</b>", estilos["cell_label"]),
            Paragraph(texto_seguro(solicitud["area_unidad"])[:80], estilos["cell_text"]),
        ],
        [
            Paragraph("<b>Cargo</b>", estilos["cell_label"]),
            Paragraph(texto_seguro(solicitud["cargo"])[:80], estilos["cell_text"]),
            Paragraph("<b>Fecha</b>", estilos["cell_label"]),
            Paragraph(serializar_fecha(solicitud["fecha_solicitud"]), estilos["cell_text"]),
        ],
    ]

    tabla_solicitante = Table(
        datos_solicitante,
        colWidths=[2.3 * cm, 6.4 * cm, 2.3 * cm, 6.4 * cm],
        rowHeights=[0.50 * cm, 0.50 * cm, 0.50 * cm, 0.50 * cm]
    )

    tabla_solicitante.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#111827")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#374151")),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f8fafc")),
        ("BACKGROUND", (2, 0), (2, -1), colors.HexColor("#f8fafc")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))

    elementos.append(tabla_solicitante)
    elementos.append(Spacer(1, 0.18 * cm))

    # =====================================================
    # 2. información del acceso
    # =====================================================

    agregar_titulo_seccion(elementos, "2. INFORMACIÓN DEL ACCESO SOLICITADO", estilos)

    datos_acceso = [
        [
            Paragraph("<b>Tipo usuario</b>", estilos["cell_label"]),
            Paragraph(texto_seguro(solicitud["tipo_usuario"]), estilos["cell_text"]),
            Paragraph("<b>Usuario externo</b>", estilos["cell_label"]),
            Paragraph(texto_seguro(solicitud["nombre_usuario_externo"] or "No aplica")[:70], estilos["cell_text"]),
        ],
        [
            Paragraph("<b>IP</b>", estilos["cell_label"]),
            Paragraph(texto_seguro(solicitud["direccion_ip"] or "No registrada"), estilos["cell_text"]),
            Paragraph("<b>Vigencia</b>", estilos["cell_label"]),
            Paragraph(texto_seguro(solicitud["tiempo_vigencia_acceso"])[:70], estilos["cell_text"]),
        ],
        [
            Paragraph("<b>Estado</b>", estilos["cell_label"]),
            Paragraph(estado_legible_pdf(solicitud["estado"]), estilos["cell_text"]),
            Paragraph("<b>Etapa</b>", estilos["cell_label"]),
            Paragraph(etapa_legible_pdf(solicitud["etapa_actual"]), estilos["cell_text"]),
        ],
    ]

    tabla_acceso = Table(
        datos_acceso,
        colWidths=[2.3 * cm, 6.4 * cm, 2.3 * cm, 6.4 * cm],
        rowHeights=[0.50 * cm, 0.50 * cm, 0.50 * cm]
    )

    tabla_acceso.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#111827")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#374151")),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f8fafc")),
        ("BACKGROUND", (2, 0), (2, -1), colors.HexColor("#f8fafc")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))

    elementos.append(tabla_acceso)
    elementos.append(Spacer(1, 0.18 * cm))

    # =====================================================
    # 3. páginas web solicitadas
    # =====================================================

    agregar_titulo_seccion(elementos, "3. PÁGINAS WEB SOLICITADAS", estilos)

    data_paginas = [
        [
            Paragraph("<b>N°</b>", estilos["cell_label"]),
            Paragraph("<b>URL / Página web</b>", estilos["cell_label"]),
            Paragraph("<b>Descripción</b>", estilos["cell_label"])
        ]
    ]

    paginas_limitadas = paginas_web[:2]

    if paginas_limitadas:
        for pagina in paginas_limitadas:
            data_paginas.append([
                Paragraph(str(pagina.get("numero", "")), estilos["cell_text"]),
                Paragraph(texto_seguro(pagina.get("url_pagina"))[:70], estilos["cell_text"]),
                Paragraph(texto_seguro(pagina.get("descripcion"))[:70], estilos["cell_text"])
            ])
    else:
        data_paginas.append([
            Paragraph("-", estilos["cell_text"]),
            Paragraph("Sin páginas registradas", estilos["cell_text"]),
            Paragraph("-", estilos["cell_text"])
        ])

    tabla_paginas = Table(
        data_paginas,
        colWidths=[1.1 * cm, 8.1 * cm, 8.2 * cm],
        rowHeights=[0.50 * cm] + [0.50 * cm for _ in range(len(data_paginas) - 1)]
    )

    tabla_paginas.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#111827")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#374151")),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f8fafc")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))

    elementos.append(tabla_paginas)
    elementos.append(Spacer(1, 0.18 * cm))

    # =====================================================
    # 4. justificación
    # =====================================================

    agregar_titulo_seccion(elementos, "4. JUSTIFICACIÓN DE LA NECESIDAD INSTITUCIONAL", estilos)

    justificacion = texto_seguro(solicitud["justificacion_necesidad_institucional"])

    if len(justificacion) > 300:
        justificacion = justificacion[:300] + "..."

    tabla_justificacion = Table(
        [[Paragraph(justificacion, estilos["cell_text"])]],
        colWidths=[17.4 * cm],
        rowHeights=[1.25 * cm]
    )

    tabla_justificacion.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#111827")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
    ]))

    elementos.append(tabla_justificacion)
    elementos.append(Spacer(1, 0.22 * cm))

    # =====================================================
    # 5. firmas generales
    # =====================================================

    agregar_espacios_firmas(elementos, estilos)

    # =====================================================
    # 6. sección exclusiva TICS
    # =====================================================

    if incluir_seccion_tics:
        agregar_seccion_tics_vertical_compacta(elementos, estilos)

    documento.build(elementos)

    buffer.seek(0)
    return buffer


@app.route("/api/admin/solicitudes/<int:solicitud_id>/pdf", methods=["GET"])
@token_requerido
@roles_permitidos("administrador", "jefe_inmediato", "maxima_autoridad", "analista_tics")
def descargar_pdf_solicitud(solicitud_id):
    solicitud, paginas_web, error = obtener_solicitud_completa_para_pdf(solicitud_id)

    if error:
        return jsonify({
            "estado": "error",
            "mensaje": error
        }), 404

    try:
        rol_actual = request.usuario_actual["rol"]
        incluir_seccion_tics = rol_actual == "analista_tics"

        pdf_buffer = generar_pdf_solicitud_a4(
            solicitud,
            paginas_web,
            incluir_seccion_tics=incluir_seccion_tics
        )

        nombre_archivo = f"{solicitud['codigo_solicitud']}.pdf"

        return send_file(
            pdf_buffer,
            mimetype="application/pdf",
            as_attachment=True,
            download_name=nombre_archivo
        )

    except Exception as error:
        return jsonify({
            "estado": "error",
            "mensaje": "error al generar el PDF.",
            "error": str(error)
        }), 500

# =====================================================
# detalle administrativo de solicitud
# =====================================================

@app.route("/api/admin/solicitudes/<int:solicitud_id>", methods=["GET"])
@token_requerido
@roles_permitidos("administrador", "analista_tics", "jefe_inmediato", "maxima_autoridad")
def obtener_solicitud_admin(solicitud_id):
    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor(dictionary=True)

        sql_solicitud = """
            select
                id,
                codigo_solicitud,
                nombres_completos,
                cedula,
                correo_institucional,
                telefono_ext,
                dependencia,
                area_unidad,
                cargo,
                fecha_solicitud,
                tipo_usuario,
                nombre_usuario_externo,
                direccion_ip,
                tiempo_vigencia_acceso,
                justificacion_necesidad_institucional,
                estado,
                etapa_actual,
                bloqueada,
                created_at,
                updated_at
            from solicitudes
            where id = %s
            limit 1;
        """

        cursor.execute(sql_solicitud, (solicitud_id,))
        solicitud = cursor.fetchone()

        if solicitud is None:
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "solicitud no encontrada."
            }), 404

        solicitud["fecha_solicitud"] = serializar_fecha(solicitud["fecha_solicitud"])
        solicitud["created_at"] = serializar_fecha(solicitud["created_at"])
        solicitud["updated_at"] = serializar_fecha(solicitud["updated_at"])

        sql_paginas = """
            select
                id,
                numero,
                url_pagina,
                descripcion
            from solicitud_paginas_web
            where solicitud_id = %s
            order by numero asc;
        """

        cursor.execute(sql_paginas, (solicitud_id,))
        paginas_web = cursor.fetchall()

        cursor.close()
        conexion.close()

        return jsonify({
            "estado": "ok",
            "solicitud": solicitud,
            "paginas_web": paginas_web
        }), 200

    except Error as error:
        return jsonify({
            "estado": "error",
            "mensaje": "error al obtener la solicitud.",
            "error": str(error)
        }), 500


# =====================================================
# flujo administrativo de aprobación / rechazo
# =====================================================

def obtener_siguiente_estado_por_rol(estado_actual, rol_actual):
    flujo = {
        "pendiente_firma_solicitante": {
            "rol": "administrador",
            "nuevo_estado": "pendiente_jefe_inmediato",
            "nueva_etapa": "jefe_inmediato"
        },
        "pendiente_jefe_inmediato": {
            "rol": "jefe_inmediato",
            "nuevo_estado": "pendiente_maxima_autoridad",
            "nueva_etapa": "maxima_autoridad"
        },
        "pendiente_maxima_autoridad": {
            "rol": "maxima_autoridad",
            "nuevo_estado": "pendiente_tics",
            "nueva_etapa": "tics"
        },
        "pendiente_tics": {
            "rol": "analista_tics",
            "nuevo_estado": "pendiente_ejecucion_tics",
            "nueva_etapa": "ejecucion_tics"
        },
        "pendiente_ejecucion_tics": {
            "rol": "analista_tics",
            "nuevo_estado": "finalizada",
            "nueva_etapa": "finalizado"
        }
    }

    regla = flujo.get(estado_actual)

    if regla is None:
        return None

    if regla["rol"] != rol_actual:
        return None

    return regla


def obtener_estado_rechazo_por_rol(estado_actual, rol_actual):
    rechazos = {
        "pendiente_jefe_inmediato": {
            "rol": "jefe_inmediato",
            "nuevo_estado": "rechazada_jefe_inmediato",
            "nueva_etapa": "jefe_inmediato"
        },
        "pendiente_maxima_autoridad": {
            "rol": "maxima_autoridad",
            "nuevo_estado": "rechazada_maxima_autoridad",
            "nueva_etapa": "maxima_autoridad"
        },
        "pendiente_tics": {
            "rol": "analista_tics",
            "nuevo_estado": "rechazada_tics",
            "nueva_etapa": "tics"
        }
    }

    regla = rechazos.get(estado_actual)

    if regla is None:
        return None

    if regla["rol"] != rol_actual:
        return None

    return regla

def archivo_pdf_valido(archivo):
    if archivo is None:
        return False

    nombre_archivo = archivo.filename or ""

    return nombre_archivo.lower().endswith(".pdf")


# =====================================================
# carga de documentos firmados
# =====================================================

@app.route("/api/admin/solicitudes/<int:solicitud_id>/documentos", methods=["POST"])
@token_requerido
@roles_permitidos("administrador", "jefe_inmediato", "maxima_autoridad", "analista_tics")
def subir_documento_firmado(solicitud_id):
    usuario_actual = request.usuario_actual
    rol_actual = usuario_actual["rol"]

    if not request.files:
        return jsonify({
            "estado": "error",
            "mensaje": "debe seleccionar un archivo PDF."
        }), 400

    archivo = next(iter(request.files.values()))

    if archivo is None or not archivo.filename:
        return jsonify({
            "estado": "error",
            "mensaje": "debe seleccionar un archivo PDF válido."
        }), 400

    if not archivo_pdf_valido(archivo):
        return jsonify({
            "estado": "error",
            "mensaje": "solo se permiten archivos con extensión .pdf."
        }), 400

    tipo_documento = limpiar_texto(request.form.get("tipo_documento"))
    observacion = normalizar_espacios(request.form.get("observacion"))

    tipos_validos = [
        "pdf_firmado_manual",
        "pdf_firmado_electronico",
        "pdf_tics",
        "pdf_final"
    ]

    if tipo_documento not in tipos_validos:
        return jsonify({
            "estado": "error",
            "mensaje": "tipo de documento no válido.",
            "tipos_validos": tipos_validos
        }), 400

    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor(dictionary=True)

        cursor.execute("""
            select
                id,
                codigo_solicitud,
                estado,
                etapa_actual,
                bloqueada
            from solicitudes
            where id = %s
            limit 1;
        """, (solicitud_id,))

        solicitud = cursor.fetchone()

        if solicitud is None:
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "solicitud no encontrada."
            }), 404

        nombre_original = secure_filename(archivo.filename)
        extension = os.path.splitext(nombre_original)[1].lower()

        nombre_archivo = f"{solicitud['codigo_solicitud']}_{rol_actual}_{tipo_documento}{extension}"
        ruta_archivo = os.path.join(FIRMADOS_FOLDER, nombre_archivo)

        archivo.save(ruta_archivo)

        cursor.execute("""
            insert into solicitud_documentos (
                solicitud_id,
                etapa,
                rol_firmante,
                usuario_id,
                tipo_documento,
                nombre_archivo,
                ruta_archivo,
                mime_type,
                firmado,
                firma_validada,
                observacion
            ) values (
                %s, %s, %s, %s, %s, %s, %s, %s, 1, 1, %s
            );
        """, (
            solicitud_id,
            solicitud["etapa_actual"],
            rol_actual,
            usuario_actual["id"],
            tipo_documento,
            nombre_archivo,
            ruta_archivo,
            "application/pdf",
            observacion
        ))

        documento_id = cursor.lastrowid

        conexion.commit()

        cursor.close()
        conexion.close()

        registrar_auditoria(
            usuario_id=usuario_actual["id"],
            solicitud_id=solicitud_id,
            modulo="documentos",
            accion="subir_documento_firmado",
            descripcion=f"documento firmado subido por rol {rol_actual}",
            datos_anteriores=None,
            datos_nuevos={
                "documento_id": documento_id,
                "tipo_documento": tipo_documento,
                "nombre_archivo": nombre_archivo,
                "rol_firmante": rol_actual,
                "etapa": solicitud["etapa_actual"]
            }
        )

        return jsonify({
            "estado": "ok",
            "mensaje": "documento firmado subido correctamente.",
            "documento": {
                "id": documento_id,
                "solicitud_id": solicitud_id,
                "tipo_documento": tipo_documento,
                "nombre_archivo": nombre_archivo,
                "rol_firmante": rol_actual,
                "etapa": solicitud["etapa_actual"],
                "firmado": True,
                "firma_validada": True
            }
        }), 201

    except Error as error:
        try:
            conexion.rollback()
            conexion.close()
        except Exception:
            pass

        return jsonify({
            "estado": "error",
            "mensaje": "error al registrar el documento firmado.",
            "error": str(error)
        }), 500

    except Exception as error:
        try:
            conexion.rollback()
            conexion.close()
        except Exception:
            pass

        return jsonify({
            "estado": "error",
            "mensaje": "error inesperado al subir el documento.",
            "error": str(error)
        }), 500

# =====================================================
# aprobación de solicitud
# =====================================================

@app.route("/api/admin/solicitudes/<int:solicitud_id>/aprobar", methods=["PUT"])
@token_requerido
@roles_permitidos("administrador", "jefe_inmediato", "maxima_autoridad", "analista_tics")
def aprobar_solicitud(solicitud_id):
    usuario_actual = request.usuario_actual
    rol_actual = usuario_actual["rol"]

    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor(dictionary=True)

        # =====================================================
        # Obtener solicitud actual
        # =====================================================

        cursor.execute("""
            select
                id,
                codigo_solicitud,
                estado,
                etapa_actual,
                bloqueada
            from solicitudes
            where id = %s
            limit 1;
        """, (solicitud_id,))

        solicitud = cursor.fetchone()

        if solicitud is None:
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "solicitud no encontrada."
            }), 404

        if solicitud["bloqueada"]:
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "la solicitud se encuentra bloqueada y no puede ser procesada."
            }), 409

        estado_anterior = solicitud["estado"]
        etapa_anterior = solicitud["etapa_actual"]

        # =====================================================
        # Validar rol y estado actual
        # =====================================================

        regla = obtener_siguiente_estado_por_rol(estado_anterior, rol_actual)

        if regla is None:
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "no tiene permisos para aprobar esta solicitud en su estado actual.",
                "rol_actual": rol_actual,
                "estado_actual": estado_anterior
            }), 403

        # =====================================================
        # Validar documento firmado obligatorio
        # =====================================================
        # Regla:
        # No se puede aprobar si no existe:
        # - PDF firmado manualmente
        # - PDF firmado electrónicamente
        # - PDF TICS
        # - PDF final
        # - o registro con firmado/firma_validada = 1
        # =====================================================

        cursor.execute("""
            select
                id,
                tipo_documento,
                nombre_archivo,
                ruta_archivo,
                mime_type,
                firmado,
                firma_validada
            from solicitud_documentos
            where solicitud_id = %s
              and mime_type = 'application/pdf'
              and (
                    firmado = 1
                    or firma_validada = 1
                    or tipo_documento in (
                        'pdf_firmado_manual',
                        'pdf_firmado_electronico',
                        'pdf_tics',
                        'pdf_final'
                    )
              )
            order by id desc
            limit 1;
        """, (solicitud_id,))

        documento_firmado = cursor.fetchone()

        if documento_firmado is None:
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "antes de aprobar debe existir un PDF firmado manualmente o una firma electrónica registrada.",
                "requisito": "pdf_firmado_o_firma_electronica",
                "rol_actual": rol_actual,
                "estado_actual": estado_anterior
            }), 409

        nuevo_estado = regla["nuevo_estado"]
        nueva_etapa = regla["nueva_etapa"]

        # =====================================================
        # Actualizar flujo de solicitud
        # =====================================================

        cursor.execute("""
            update solicitudes
            set
                estado = %s,
                etapa_actual = %s,
                updated_at = now()
            where id = %s;
        """, (nuevo_estado, nueva_etapa, solicitud_id))

        conexion.commit()

        cursor.close()
        conexion.close()

        registrar_auditoria(
            usuario_id=usuario_actual["id"],
            solicitud_id=solicitud_id,
            modulo="flujo_solicitud",
            accion="aprobar_solicitud",
            descripcion=f"solicitud {solicitud['codigo_solicitud']} aprobada por rol {rol_actual}",
            datos_anteriores={
                "estado": estado_anterior,
                "etapa_actual": etapa_anterior
            },
            datos_nuevos={
                "estado": nuevo_estado,
                "etapa_actual": nueva_etapa,
                "documento_firmado_id": documento_firmado["id"],
                "tipo_documento": documento_firmado["tipo_documento"],
                "nombre_archivo": documento_firmado["nombre_archivo"]
            }
        )

        return jsonify({
            "estado": "ok",
            "mensaje": "solicitud aprobada correctamente.",
            "solicitud": {
                "id": solicitud_id,
                "codigo_solicitud": solicitud["codigo_solicitud"],
                "estado_anterior": estado_anterior,
                "estado_actual": nuevo_estado,
                "etapa_actual": nueva_etapa,
                "documento_firmado": {
                    "id": documento_firmado["id"],
                    "tipo_documento": documento_firmado["tipo_documento"],
                    "nombre_archivo": documento_firmado["nombre_archivo"]
                }
            }
        }), 200

    except Error as error:
        try:
            conexion.rollback()
            conexion.close()
        except Exception:
            pass

        return jsonify({
            "estado": "error",
            "mensaje": "error al aprobar la solicitud.",
            "error": str(error)
        }), 500

    except Exception as error:
        try:
            conexion.rollback()
            conexion.close()
        except Exception:
            pass

        return jsonify({
            "estado": "error",
            "mensaje": "error inesperado al aprobar la solicitud.",
            "error": str(error)
        }), 500


# =====================================================
# rechazo de solicitud
# =====================================================

@app.route("/api/admin/solicitudes/<int:solicitud_id>/rechazar", methods=["PUT"])
@token_requerido
@roles_permitidos("jefe_inmediato", "maxima_autoridad", "analista_tics")
def rechazar_solicitud(solicitud_id):
    usuario_actual = request.usuario_actual
    rol_actual = usuario_actual["rol"]

    data = request.get_json() or {}
    motivo = normalizar_espacios(data.get("motivo"))

    if not motivo:
        return jsonify({
            "estado": "error",
            "mensaje": "el motivo del rechazo es obligatorio."
        }), 400

    if len(motivo) < 10:
        return jsonify({
            "estado": "error",
            "mensaje": "el motivo del rechazo debe tener mínimo 10 caracteres."
        }), 400

    if len(motivo) > 1000:
        return jsonify({
            "estado": "error",
            "mensaje": "el motivo del rechazo no puede superar 1000 caracteres."
        }), 400

    conexion = get_db_connection()

    if conexion is None:
        return jsonify({
            "estado": "error",
            "mensaje": "no se pudo conectar con la base de datos."
        }), 500

    try:
        cursor = conexion.cursor(dictionary=True)

        # =====================================================
        # Obtener solicitud actual
        # =====================================================

        cursor.execute("""
            select
                id,
                codigo_solicitud,
                estado,
                etapa_actual,
                bloqueada
            from solicitudes
            where id = %s
            limit 1;
        """, (solicitud_id,))

        solicitud = cursor.fetchone()

        if solicitud is None:
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "solicitud no encontrada."
            }), 404

        if solicitud["bloqueada"]:
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "la solicitud se encuentra bloqueada y no puede ser procesada."
            }), 409

        estado_anterior = solicitud["estado"]
        etapa_anterior = solicitud["etapa_actual"]

        # =====================================================
        # Validar rol y estado actual
        # =====================================================

        regla = obtener_estado_rechazo_por_rol(estado_anterior, rol_actual)

        if regla is None:
            cursor.close()
            conexion.close()

            return jsonify({
                "estado": "error",
                "mensaje": "no tiene permisos para rechazar esta solicitud en su estado actual.",
                "rol_actual": rol_actual,
                "estado_actual": estado_anterior
            }), 403

        nuevo_estado = regla["nuevo_estado"]
        nueva_etapa = regla["nueva_etapa"]

        cursor.execute("""
            update solicitudes
            set
                estado = %s,
                etapa_actual = %s,
                updated_at = now()
            where id = %s;
        """, (nuevo_estado, nueva_etapa, solicitud_id))

        conexion.commit()

        cursor.close()
        conexion.close()

        registrar_auditoria(
            usuario_id=usuario_actual["id"],
            solicitud_id=solicitud_id,
            modulo="flujo_solicitud",
            accion="rechazar_solicitud",
            descripcion=f"solicitud {solicitud['codigo_solicitud']} rechazada por rol {rol_actual}",
            datos_anteriores={
                "estado": estado_anterior,
                "etapa_actual": etapa_anterior
            },
            datos_nuevos={
                "estado": nuevo_estado,
                "etapa_actual": nueva_etapa,
                "motivo": motivo
            }
        )

        return jsonify({
            "estado": "ok",
            "mensaje": "solicitud rechazada correctamente.",
            "solicitud": {
                "id": solicitud_id,
                "codigo_solicitud": solicitud["codigo_solicitud"],
                "estado_anterior": estado_anterior,
                "estado_actual": nuevo_estado,
                "etapa_actual": nueva_etapa,
                "motivo": motivo
            }
        }), 200

    except Error as error:
        try:
            conexion.rollback()
            conexion.close()
        except Exception:
            pass

        return jsonify({
            "estado": "error",
            "mensaje": "error al rechazar la solicitud.",
            "error": str(error)
        }), 500

    except Exception as error:
        try:
            conexion.rollback()
            conexion.close()
        except Exception:
            pass

        return jsonify({
            "estado": "error",
            "mensaje": "error inesperado al rechazar la solicitud.",
            "error": str(error)
        }), 500


# =====================================================
# manejo de errores
# =====================================================

@app.errorhandler(404)
def error_404(error):
    return jsonify({
        "estado": "error",
        "mensaje": "ruta no encontrada."
    }), 404


@app.errorhandler(405)
def error_405(error):
    return jsonify({
        "estado": "error",
        "mensaje": "método no permitido para esta ruta."
    }), 405


@app.errorhandler(413)
def error_413(error):
    return jsonify({
        "estado": "error",
        "mensaje": "el archivo supera el tamaño máximo permitido de 10 MB."
    }), 413


@app.errorhandler(500)
def error_500(error):
    return jsonify({
        "estado": "error",
        "mensaje": "error interno del servidor."
    }), 500


# =====================================================
# iniciar servidor
# =====================================================

if __name__ == "__main__":
    print("======================================")
    print(" backend inamhi liberación web iniciado correctamente ")
    print(f" url test: http://{BACKEND_HOST}:{BACKEND_PORT}/api/test ")
    print(f" url mysql: http://{BACKEND_HOST}:{BACKEND_PORT}/api/test-db ")
    print(f" url reset passwords: http://{BACKEND_HOST}:{BACKEND_PORT}/api/dev/reset-passwords ")
    print(f" url registrar solicitud: http://{BACKEND_HOST}:{BACKEND_PORT}/api/public/solicitudes ")
    print(" frontend permitido: http://localhost:4300 ")
    print("======================================")

    app.run(
        host=BACKEND_HOST,
        port=BACKEND_PORT,
        debug=True
    )