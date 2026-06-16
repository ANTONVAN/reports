import sql from 'mssql';

/**
 * Reports configuration.
 *
 * To add a new report:
 * 1. Add a new entry to this object with a unique key
 * 2. Define params (what the frontend sends as query params)
 * 3. Define buildQuery(params, request) that binds parameters and returns the SQL string
 *
 * The frontend only needs to call: GET /api/reports/<key>?param1=value1&param2=value2
 */
const ROUTE_MAP = {
  '9750B27C-F6EA-4E40-A0C7-6A0FFA6DD794': 'ORTHIN',
  '5453EAF0-985A-4110-8C5C-5C2C501264EE': 'CLINICA RUIZ',
  '92993E1A-B788-426B-81B5-997415CFD353': 'TEST6',
  'BC075FCE-A60B-418E-984A-A75785068BD4': 'UPC',
  'DC5CDFFE-5687-4FD5-B1B2-AA0D73C25784': 'CENAREM',
  '4555483A-5424-471A-A881-B3B41A81AA98': 'QUEST',
  '2750B58F-2861-4BFC-A0CE-B60BBB128BCA': 'CLINICA MAYO',
  '55B899D3-8563-4515-9AD3-CFE93969E993': 'AIMSA',
  'BB75603D-65F3-4DD0-A639-F13ADA795ACA': 'Q ARANA',
  '9B32E0D8-8C1F-4571-98B9-F4C335095446': 'LABORATORIO DE ALERGIA MOLECULAR',
};

const CIUDADES = [
  'Ciudad Obregón',
  'Hermosillo',
  'Heroica Guaymas',
  'Magdalena de Kino',
  'Monterrey',
  'Navojoa',
  'San Pedro Garza García',
];

const reports = {
  maquilas: {
    params: ['startDate', 'endDate'],
    // Expose filter options so frontend can fetch them
    meta: {
      ciudades: CIUDADES,
      maquiladores: Object.entries(ROUTE_MAP).map(([id, name]) => ({ id, name })),
    },
    buildQuery(params, request) {
      request.input('startDate', sql.DateTime, new Date(params.startDate));
      request.input('endDate', sql.DateTime, new Date(params.endDate));

      // Filter by selected ciudades or use all
      let selectedCiudades = CIUDADES;
      if (params.ciudades) {
        selectedCiudades = params.ciudades.split(',').filter(c => CIUDADES.includes(c));
        if (!selectedCiudades.length) selectedCiudades = CIUDADES;
      }
      const ciudadParams = selectedCiudades.map((c, i) => {
        request.input(`ciudad${i}`, sql.NVarChar, c);
        return `@ciudad${i}`;
      }).join(',');

      // Filter by selected routes or use all
      const ALL_ROUTE_IDS = Object.keys(ROUTE_MAP);
      let selectedRoutes = ALL_ROUTE_IDS;
      if (params.maquiladores) {
        const requested = params.maquiladores.split(',');
        selectedRoutes = requested.filter(id => ALL_ROUTE_IDS.includes(id));
        if (!selectedRoutes.length) selectedRoutes = ALL_ROUTE_IDS;
      }
      const routeParams = selectedRoutes.map((id, i) => {
        request.input(`route${i}`, sql.UniqueIdentifier, id);
        return `@route${i}`;
      }).join(',');

      return `
        SELECT SU.Nombre as Sucursal,
               S.[Clave] AS Solicitud,
               RTRIM(EX.NombrePaciente + ' ' + ISNULL(EX.PrimerApellido,'') + ' ' + ISNULL(EX.SegundoApellido,'')) AS NombrePaciente,
               ME.Nombre as Medico,
               E.Clave AS ClaveEstudio,
               E.Nombre AS NombreEstudio,
               ES.Nombre as Estatus,
               CR.Nombre as Ruta,
               M.Clave as Maquilador,
               CASE S.Urgencia
                 WHEN 1 THEN 'Normal'
                 WHEN 2 THEN 'URGENTE'
                 WHEN 3 THEN 'URGENTE CON CARGO'
               END AS Urgencia,
               RE.FechaEntrega as FechaEntrega
        FROM [LAB_RAMOS_PROD_EXPEDIENTE].[dbo].[Relacion_Solicitud_Estudio] AS RE
        INNER JOIN [LAB_RAMOS_PROD_EXPEDIENTE].[dbo].[CAT_Solicitud] AS S
            ON RE.SolicitudId = S.Id
        INNER JOIN [LAB_RAMOS_PROD_EXPEDIENTE].[dbo].[CAT_Expedientes] as EX
            ON S.ExpedienteId = EX.Id
        INNER JOIN [LAB_RAMOS_PROD_EXPEDIENTE].[dbo].[CAT_Medico] as ME
            ON S.MedicoId = ME.Id
        INNER JOIN [LAB_RAMOS_PROD_CATALOGO].[dbo].[Relacion_Ruta_Estudio] AS R
            ON RE.EstudioId = R.EstudioId
        INNER JOIN [LAB_RAMOS_PROD_CATALOGO].[dbo].[CAT_Rutas] AS CR
            ON R.RouteId = CR.Id
        INNER JOIN [LAB_RAMOS_PROD_CATALOGO].[dbo].CAT_Maquilador as M
            ON CR.MaquiladorId = M.Id
        INNER JOIN [LAB_RAMOS_PROD_CATALOGO].[dbo].[CAT_Estudio] AS E
            ON R.EstudioId = E.Id
        INNER JOIN [LAB_RAMOS_PROD_EXPEDIENTE].[dbo].[Estatus_Solicitud_Estudio] AS ES
            ON RE.EstatusId = ES.Id
        INNER JOIN [LAB_RAMOS_PROD_CATALOGO].[dbo].[CAT_Sucursal] AS SU
            ON S.SucursalId = SU.Id
        WHERE S.FechaCreo >= @startDate
          AND S.FechaCreo < @endDate
          AND RE.EstatusId <> 9
          AND SU.Ciudad IN (${ciudadParams})
          AND R.RouteId IN (${routeParams})
        ORDER BY S.SucursalId, S.Clave
      `;
    },
  },

  'indicadores-daily': {
    params: ['startDate', 'endDate'],
    meta: {},
    buildQuery(params, request) {
      // startDate at 12:00:00 (noon), endDate + 1 day at 08:00:00
      const start = `${params.startDate} 12:00:00`;
      const end = `${params.endDate} 08:00:00`;
      request.input('startDate', sql.NVarChar, start);
      request.input('endDate', sql.NVarChar, end);

      return `
        WITH Solicitudes AS (
          SELECT
            CONVERT(date, DATEADD(hour, -12, S.FechaCreo)) AS FechaTrabajo,
            S.SucursalId,
            COUNT(*) AS CantidadSolicitudes
          FROM [LAB_RAMOS_PROD_EXPEDIENTE].[dbo].[CAT_Solicitud] AS S
          WHERE S.Procedencia = 2 AND 
          S.SucursalId IN (
            '92BB555D-8D08-4107-97A5-6296FBA09A49',
            'C4B35CF3-F6C9-4F26-8085-8202B51C7FC5',
            '22C17091-64D1-4FFB-9387-147CA43132D2',
            'A5A3F4BF-9330-429C-A0EA-F2BE9F13CA09'
          )
          AND S.FechaCreo >= @startDate
          AND S.FechaCreo < DATEADD(day, 1, @endDate)
          AND S.EstatusId <> 3
          GROUP BY CONVERT(date, DATEADD(hour, -12, S.FechaCreo)), S.SucursalId
        ),
        Pagos AS (
          SELECT
            CONVERT(date, DATEADD(hour, -12, P.FechaPago)) AS FechaTrabajo,
            S.SucursalId,
            SUM(P.Cantidad) AS TotalPagos
          FROM [LAB_RAMOS_PROD_EXPEDIENTE].[dbo].[CAT_Solicitud] AS S
          LEFT JOIN [LAB_RAMOS_PROD_EXPEDIENTE].[dbo].[Relacion_Solicitud_Pago] AS P
            ON S.Id = P.SolicitudId AND P.EstatusId IN (1,2)
          WHERE S.Procedencia = 2 AND 
          S.SucursalId IN (
            '92BB555D-8D08-4107-97A5-6296FBA09A49',
            'C4B35CF3-F6C9-4F26-8085-8202B51C7FC5',
            '22C17091-64D1-4FFB-9387-147CA43132D2',
            'A5A3F4BF-9330-429C-A0EA-F2BE9F13CA09'
          )
          AND P.FechaPago >= @startDate
          AND P.FechaPago < DATEADD(day, 1, @endDate)
          AND S.EstatusId <> 3
          AND P.FormaPagoId <> 5
          GROUP BY CONVERT(date, DATEADD(hour, -12, P.FechaPago)), S.SucursalId
        )
        SELECT
          CONVERT(varchar(10), S.FechaTrabajo, 120) AS FechaTrabajo,
          SU.Clave AS Sucursal,
          S.CantidadSolicitudes,
          ISNULL(P.TotalPagos,0) AS TotalPagos,
          S.CantidadSolicitudes * 13 AS CostoToma
        FROM Solicitudes AS S
        INNER JOIN [LAB_RAMOS_PROD_CATALOGO].[dbo].[CAT_Sucursal] AS SU
          ON S.SucursalId = SU.Id
        LEFT JOIN Pagos AS P
          ON S.SucursalId = P.SucursalId AND S.FechaTrabajo = P.FechaTrabajo

        UNION ALL

        SELECT
          CONVERT(varchar(10), S.FechaTrabajo, 120) AS FechaTrabajo,
          'TOTAL' AS Sucursal,
          SUM(S.CantidadSolicitudes),
          SUM(ISNULL(P.TotalPagos,0)),
          SUM(S.CantidadSolicitudes) * 13
        FROM Solicitudes AS S
        LEFT JOIN Pagos AS P
          ON S.SucursalId = P.SucursalId AND S.FechaTrabajo = P.FechaTrabajo
        GROUP BY S.FechaTrabajo
        ORDER BY FechaTrabajo, Sucursal
      `;
    },
  },

  'indicadores-monthly': {
    params: ['startDate', 'endDate'],
    meta: {},
    buildQuery(params, request) {
      const start = `${params.startDate} 12:00:00`;
      const end = `${params.endDate} 08:00:00`;
      request.input('startDate', sql.NVarChar, start);
      request.input('endDate', sql.NVarChar, end);

      return `
        WITH Solicitudes AS (
          SELECT
            YEAR(DATEADD(hour, -12, S.FechaCreo)) AS AnioTrabajo,
            MONTH(DATEADD(hour, -12, S.FechaCreo)) AS MesTrabajo,
            S.SucursalId,
            COUNT(*) AS CantidadSolicitudes
          FROM [LAB_RAMOS_PROD_EXPEDIENTE].[dbo].[CAT_Solicitud] AS S
          WHERE S.Procedencia = 2 AND 
          S.SucursalId IN (
            '92BB555D-8D08-4107-97A5-6296FBA09A49',
            'C4B35CF3-F6C9-4F26-8085-8202B51C7FC5',
            '22C17091-64D1-4FFB-9387-147CA43132D2',
            'A5A3F4BF-9330-429C-A0EA-F2BE9F13CA09'
          )
          AND S.FechaCreo >= @startDate
          AND S.FechaCreo < DATEADD(day, 1, @endDate)
          AND S.EstatusId <> 3
          GROUP BY YEAR(DATEADD(hour, -12, S.FechaCreo)), MONTH(DATEADD(hour, -12, S.FechaCreo)), S.SucursalId
        ),
        Pagos AS (
          SELECT
            YEAR(DATEADD(hour, -12, P.FechaPago)) AS AnioTrabajo,
            MONTH(DATEADD(hour, -12, P.FechaPago)) AS MesTrabajo,
            S.SucursalId,
            SUM(P.Cantidad) AS TotalPagos
          FROM [LAB_RAMOS_PROD_EXPEDIENTE].[dbo].[CAT_Solicitud] AS S
          LEFT JOIN [LAB_RAMOS_PROD_EXPEDIENTE].[dbo].[Relacion_Solicitud_Pago] AS P
            ON S.Id = P.SolicitudId AND P.EstatusId IN (1,2)
          WHERE S.Procedencia = 2 AND 
          S.SucursalId IN (
            '92BB555D-8D08-4107-97A5-6296FBA09A49',
            'C4B35CF3-F6C9-4F26-8085-8202B51C7FC5',
            '22C17091-64D1-4FFB-9387-147CA43132D2',
            'A5A3F4BF-9330-429C-A0EA-F2BE9F13CA09'
          )
          AND P.FechaPago >= @startDate
          AND P.FechaPago < DATEADD(day, 1, @endDate)
          AND S.EstatusId <> 3
          AND P.FormaPagoId <> 5
          GROUP BY YEAR(DATEADD(hour, -12, P.FechaPago)), MONTH(DATEADD(hour, -12, P.FechaPago)), S.SucursalId
        )
        SELECT
          CONCAT(S.AnioTrabajo, '-', RIGHT('00' + CAST(S.MesTrabajo AS varchar(2)), 2)) AS MesTrabajo,
          SU.Clave AS Sucursal,
          S.CantidadSolicitudes,
          ISNULL(P.TotalPagos,0) AS TotalPagos,
          S.CantidadSolicitudes * 13 AS CostoToma
        FROM Solicitudes AS S
        INNER JOIN [LAB_RAMOS_PROD_CATALOGO].[dbo].[CAT_Sucursal] AS SU
          ON S.SucursalId = SU.Id
        LEFT JOIN Pagos AS P
          ON S.SucursalId = P.SucursalId AND S.AnioTrabajo = P.AnioTrabajo AND S.MesTrabajo = P.MesTrabajo

        UNION ALL

        SELECT
          CONCAT(S.AnioTrabajo, '-', RIGHT('00' + CAST(S.MesTrabajo AS varchar(2)), 2)) AS MesTrabajo,
          'TOTAL' AS Sucursal,
          SUM(S.CantidadSolicitudes),
          SUM(ISNULL(P.TotalPagos,0)),
          SUM(S.CantidadSolicitudes) * 13
        FROM Solicitudes AS S
        LEFT JOIN Pagos AS P
          ON S.SucursalId = P.SucursalId AND S.AnioTrabajo = P.AnioTrabajo AND S.MesTrabajo = P.MesTrabajo
        GROUP BY S.AnioTrabajo, S.MesTrabajo
        ORDER BY MesTrabajo, Sucursal
      `;
    },
  },

  medicos: {
    params: ['startDate', 'endDate'],
    // Dynamic meta - fetched from DB
    async meta(db) {
      const [medicosRes, especialidadesRes] = await Promise.all([
        db.request().query(`
          SELECT [IdMedico], [Clave],
            (Clave + ' - ' + Nombre + ' ' + PrimerApellido + ' ' + ISNULL(SegundoApellido,'')) as NombreCompleto,
            [EspecialidadId]
          FROM [LAB_RAMOS_PROD_CATALOGO].[dbo].[CAT_Medico]
          WHERE Activo = 1 AND (Hidden = 0 OR Hidden IS NULL)
          ORDER BY Nombre + ' ' + PrimerApellido + ' ' + ISNULL(SegundoApellido,'')
        `),
        db.request().query(`
          SELECT [Id], [Clave], [Nombre]
          FROM [LAB_RAMOS_PROD_CATALOGO].[dbo].[CAT_Especialidad]
          WHERE Activo = 1
          ORDER BY Nombre
        `),
      ]);
      return {
        medicos: medicosRes.recordset.map(m => ({ id: m.IdMedico, nombre: m.NombreCompleto })),
        especialidades: especialidadesRes.recordset.map(e => ({ id: e.Id, nombre: e.Nombre })),
        ciudades: CIUDADES,
      };
    },
    buildQuery(params, request) {
      const start = `${params.startDate} 12:00:00`;
      const end = `${params.endDate} 08:00:00`;
      request.input('startDate', sql.NVarChar, start);
      request.input('endDate', sql.NVarChar, end);

      // Optional filters
      let medicoFilter = 'S.MedicoId IS NOT NULL';
      if (params.medicoId) {
        const ids = params.medicoId.split(',');
        const medicoParams = ids.map((id, i) => {
          request.input(`medico${i}`, sql.UniqueIdentifier, id);
          return `@medico${i}`;
        }).join(',');
        medicoFilter = `S.MedicoId IN (${medicoParams})`;
      }

      let especialidadFilter = '';
      if (params.especialidadId) {
        const ids = params.especialidadId.split(',');
        const espParams = ids.map((id, i) => {
          request.input(`esp${i}`, sql.Int, parseInt(id));
          return `@esp${i}`;
        }).join(',');
        especialidadFilter = `AND M.EspecialidadId IN (${espParams})`;
      }

      let ciudadFilter = '';
      if (params.ciudadId) {
        const cities = params.ciudadId.split(',');
        const cityParams = cities.map((c, i) => {
          request.input(`city${i}`, sql.NVarChar, c);
          return `@city${i}`;
        }).join(',');
        ciudadFilter = `AND SU.Ciudad IN (${cityParams})`;
      }

      return `
        WITH Solicitudes AS (
          SELECT
            YEAR(DATEADD(hour, -12, S.FechaCreo)) AS AnioTrabajo,
            MONTH(DATEADD(hour, -12, S.FechaCreo)) AS MesTrabajo,
            S.MedicoId,
            COUNT(*) AS CantidadSolicitudes
          FROM [LAB_RAMOS_PROD_EXPEDIENTE].[dbo].[CAT_Solicitud] AS S
          INNER JOIN [LAB_RAMOS_PROD_CATALOGO].[dbo].[CAT_Medico] AS M
            ON S.MedicoId = M.IdMedico
          INNER JOIN [LAB_RAMOS_PROD_CATALOGO].[dbo].[CAT_Sucursal] AS SU
            ON S.SucursalId = SU.Id
          WHERE ${medicoFilter}
            ${especialidadFilter}
            AND S.FechaCreo >= @startDate
            AND S.FechaCreo < DATEADD(day, 1, @endDate)
            AND S.EstatusId <> 3
            ${ciudadFilter}
          GROUP BY YEAR(DATEADD(hour, -12, S.FechaCreo)), MONTH(DATEADD(hour, -12, S.FechaCreo)), S.MedicoId
        ),
        Pagos AS (
          SELECT
            YEAR(DATEADD(hour, -12, P.FechaPago)) AS AnioTrabajo,
            MONTH(DATEADD(hour, -12, P.FechaPago)) AS MesTrabajo,
            S.MedicoId,
            SUM(P.Cantidad) AS Ingreso
          FROM [LAB_RAMOS_PROD_EXPEDIENTE].[dbo].[CAT_Solicitud] AS S
          LEFT JOIN [LAB_RAMOS_PROD_EXPEDIENTE].[dbo].[Relacion_Solicitud_Pago] AS P
            ON S.Id = P.SolicitudId AND P.EstatusId IN (1,2)
          WHERE S.MedicoId IS NOT NULL
            AND P.FechaPago >= @startDate
            AND P.FechaPago < DATEADD(day, 1, @endDate)
            AND S.EstatusId <> 3
            AND P.FormaPagoId <> 5
          GROUP BY YEAR(DATEADD(hour, -12, P.FechaPago)), MONTH(DATEADD(hour, -12, P.FechaPago)), S.MedicoId
        ),
        Totales AS (
          SELECT
            S.MedicoId,
            SUM(S.CantidadSolicitudes) AS TotalSolicitudes
          FROM Solicitudes AS S
          GROUP BY S.MedicoId
        )
        SELECT
          CONCAT(S.AnioTrabajo, '-', RIGHT('00' + CAST(S.MesTrabajo AS varchar(2)), 2)) AS MesTrabajo,
          (M.Clave + ' - ' + M.Nombre + ' ' + M.PrimerApellido + ' ' + ISNULL(M.SegundoApellido,'')) AS Medico,
          S.CantidadSolicitudes,
          ISNULL(P.Ingreso,0) AS Ingreso,
          ISNULL(CAST(P.Ingreso * 1.0 / NULLIF(S.CantidadSolicitudes,0) AS DECIMAL(10,2)),0) AS TicketPromedio
        FROM Solicitudes AS S
        INNER JOIN [LAB_RAMOS_PROD_CATALOGO].[dbo].[CAT_Medico] AS M
          ON S.MedicoId = M.IdMedico
        LEFT JOIN Pagos AS P
          ON S.MedicoId = P.MedicoId
          AND S.AnioTrabajo = P.AnioTrabajo
          AND S.MesTrabajo = P.MesTrabajo
        INNER JOIN Totales AS T
          ON S.MedicoId = T.MedicoId
        ORDER BY T.TotalSolicitudes DESC, S.AnioTrabajo, S.MesTrabajo
      `;
    },
  },
};

export default reports;
